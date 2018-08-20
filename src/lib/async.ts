/**
 * Call queue for executing callbacks asynchronously.
 *
 * Prevents releasing Zalgo.
 *
 * Copyright (C) 2015 Martin Poelstra
 * License: MIT
 */

import { assert } from "./util";

class CallQueue {
	[index: number]: any;
	public length: number = 0;

	// Basically twice the number of simultaneously resolving promises
	private _max: number = 1000;
	private _first: number = 0;

	/**
	 * Push a new callback to the queue.
	 * @return true when the queue still has space, false if it's now 'full'
	 */
	public push(callback: (arg: any) => void, arg: any): boolean {
		this[this.length++] = callback;
		this[this.length++] = arg;
		return this.length < this._max;
	}

	/**
	 * Flush all callbacks in this queue.
	 * Note that it is 'ok' for callbacks to throw an error;
	 * the next call to flush() will flush the remainder of the queue.
	 * When this function returns, the queue will be 'reset' to its beginning.
	 */
	public flush(): void {
		while (this._first < this.length) {
			const callback = this[this._first];
			const arg = this[this._first + 1];
			this[this._first] = this[this._first + 1] = undefined;
			this._first += 2;
			callback(arg);
		}
		this.length = 0;
		this._first = 0;
	}

	public empty(): boolean {
		return this._first === this.length;
	}
}

class Ring {
	/**
	 * Reference to shared pool of reusable queues, owned by our owner (`Async`).
	 */
	private _pool: CallQueue[];

	/**
	 * Ring of queues.
	 * Guaranteed to always contain at least one queue.
	 */
	private _ring: CallQueue[] = [new CallQueue()];

	/**
	 * Queue to put new callbacks in, i.e. the last queue in the ring.
	 * If `undefined`, a new queue will be obtained and added to ring on next enqueue.
	 */
	private _current: CallQueue | undefined = this._ring[0];

	constructor(pool: CallQueue[]) {
		this._pool = pool;
	}

	/**
	 * Add callback (and optional argument) to last queue in ring.
	 * Automatically obtains new queue if current queue is full.
	 */
	public enqueue(callback: () => void): void;
	public enqueue<T>(callback: (arg: T) => void, arg: T): void;
	public enqueue(callback: (arg: any) => void, arg?: any): void {
		// Make sure this._current points to a queue: obtain one
		// from pool or create a new one if necessary.
		if (!this._current) {
			this._current = this._pool.pop();
			if (!this._current) {
				this._current = new CallQueue();
			}
			this._ring.push(this._current);
		}
		// Add callback to queue
		if (!this._current.push(callback, arg)) {
			// Queue full, load a new one next time
			this._current = undefined;
		}
	}

	/**
	 * Call all callbacks in all queues in this ring, until it is empty.
	 * Note: it is 'OK' for a callback to throw an error; ring/queue state
	 * will remain valid and remaining items will be flushed on next call
	 * to `flush()`.
	 */
	public flush(): void {
		while (true) {
			// Ring is guaranteed to have at least one queue (even though
			// queue might be empty when flush() is e.g. called manually).
			this._ring[0].flush();

			// If this is the last queue in the ring, we're done
			if (this._ring.length === 1) {
				break;
			}

			// Shift the now empty ring into pool.
			// Queue at index 0 is empty, and ring length >= 2.
			// So, this._current is guaranteed to point to something 'later'
			// than queue at index 0, and we can safely move index 0 to the
			// pool.
			this._pool.push(this._ring.shift()!);
		}

		// Ring is now guaranteed to contain only a single, empty queue, so we
		// could move it to the pool.
		// However, because it's the last item remaining, better to simply
		// leave it in the ring, saves unnecessary re-move on next enqueue.
		// Also, make sure that new items will be loaded into that queue.
		this._current = this._ring[0];
	}

	/**
	 * Return true if no callbacks are enqueued in this ring.
	 */
	public empty(): boolean {
		return this._ring.length === 1 && this._ring[0].empty();
	}
}

function defaultScheduler(callback: () => void): void {
	// Note: we explicitly re-check types and call it here (instead of
	// e.g. assigning it to a variable once at startup), to allow
	// setImmediate / setTimeout to be replaced by mocked ones
	// (e.g. Sinon's useFakeTimers())
	if (typeof setImmediate === "function") {
		setImmediate(callback);
	} else {
		setTimeout(callback, 0);
	}
}

export class Async {
	private _pool: CallQueue[] = [];
	private _mainRing: Ring = new Ring(this._pool);
	private _idleRing: Ring = new Ring(this._pool);
	private _flushing: boolean = false;
	private _scheduled: boolean = false;
	private _scheduler?: (callback: () => void) => void = undefined;

	/**
	 * Configure alternative scheduler to use.
	 * The scheduler function will be called with a flusher, which needs to be
	 * executed to flush the queue. Note: the flusher may throw an
	 * exception, if any of the callbacks on the queue throws one.
	 * This will result in another flush to be scheduled before returning.
	 *
	 * Call with `undefined` to reset the scheduler to the default (setImmediate).
	 *
	 * Example usage (this is basically the default):
	 *   setScheduler((flusher) => setImmediate(flusher));
	 * Note: this is slightly different from just setScheduler(setImmediate), in that
	 * the former allows overriding setImmediate in e.g. unit tests.
	 */
	public setScheduler(scheduler: ((flusher: () => void) => void) | undefined): void {
		/* tslint:disable:no-null-keyword */ // 'old' API told you to use `null` instead of `undefined`
		assert(scheduler === undefined || scheduler === null || typeof scheduler === "function");
		/* tslint:enable:no-null-keyword */
		this._scheduler = scheduler;
	}

	/**
	 * Enqueue callback to be executed as soon as possible, but outside of the
	 * current stackframe. It is OK to enqueue new callbacks while they are
	 * being executed, in which case they will all be called before handing
	 * back control to the host JS environment.
	 *
	 * @param callback Callback to be executed with given argument
	 * @param arg      Argument to pass to callback
	 */
	public enqueue(callback: () => void): void;
	public enqueue<T>(callback: (arg: T) => void, arg: T): void;
	public enqueue(callback: (arg: any) => void, arg?: any): void {
		if (!this._flushing && !this._scheduled) {
			this._schedule();
		}
		this._mainRing.enqueue(callback, arg);
	}

	/**
	 * Enqueue callback to be executed after all other enqueued callbacks have
	 * been executed.
	 * Once the idle callbacks start to be executed, that 'batch' of idle callbacks
	 * will all be executed before any newly enqueued callbacks will be executed.
	 *
	 * @param callback Callback to be executed with given argument
	 * @param arg      Argument to pass to callback
	 */
	public enqueueIdle(callback: () => void): void;
	public enqueueIdle<T>(callback: (arg: T) => void, arg: T): void;
	public enqueueIdle(callback: (arg: any) => void, arg?: any): void {
		if (!this._flushing && !this._scheduled) {
			this._schedule();
		}
		this._idleRing.enqueue(callback, arg);
	}

	/**
	 * Flush callback queues.
	 * First, the 'normal' callback queues are flushed until they are empty (i.e.
	 * new callbacks that are added while executing will also be processed).
	 * Then, the 'idle' queues are flushed (also until they are empty).
	 * Flushing repeats until no more items are enqueued in normal or idle queues.
	 * It is an error to call flush from within an enqueued callback.
	 */
	public flush(): void {
		assert(!this._flushing, "cannot recursively flush");
		this._flushing = true;
		try {
			while (true) {
				this._mainRing.flush();
				if (this._idleRing.empty()) {
					// Both rings now empty: done
					break;
				}
				// Main ring empty, idle ring not empty.
				// Start flushing idle ring, making sure it is completely
				// processed before processing new 'normal' callbacks (even
				// if it is interrupted by a thrown error in one of them).
				// Also, make sure that any new normal callbacks are going
				// to be processed before any new idle callbacks.
				const emptyRing = this._mainRing;
				this._mainRing = this._idleRing;
				this._idleRing = emptyRing;
			}
		} finally {
			this._flushing = false;

			// If one of the callbacks in the queue throws an exception,
			// (e.g. when Promise#done() detects a rejection) make sure to
			// reschedule the remainder of the queue(s) for another iteration.
			// This approach has the advantage of immediately allowing to stop
			// the program in e.g. NodeJS, but also allows to continue running
			// correctly in a browser.
			// Note: we may be called explicitly, even though we were also
			// already scheduled, before.
			if ((!this._mainRing.empty() || !this._idleRing.empty()) && !this._scheduled) {
				this._schedule();
			}
		}
	}

	private _flusher: () => void = () => this._scheduledFlush();

	private _schedule(): void {
		assert(!this._scheduled);
		const scheduler = this._scheduler || defaultScheduler;
		// Call scheduler without a `this`
		scheduler(this._flusher);
		this._scheduled = true;
	}

	private _scheduledFlush(): void {
		// Indicate that this 'iteration' of the flush is complete.
		this._scheduled = false;
		this.flush();
	}
}

export let async = new Async();
export default async;
