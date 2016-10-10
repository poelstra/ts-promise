/**
 * Call queue for executing callbacks asynchronously.
 *
 * Prevents releasing Zalgo.
 *
 * Copyright (C) 2015 Martin Poelstra
 * License: MIT
 */

// TODO:
// - simpler code

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
			var callback = this[this._first];
			var arg = this[this._first + 1];
			this[this._first] = this[this._first + 1] = undefined;
			this._first += 2;
			callback(arg);
		}
		this.length = 0;
		this._first = 0;
	}
}

export class Async {
	/* tslint:disable:member-ordering */ // trips on the arrow-function, thinks it's something public
	private _pool: CallQueue[] = [];
	private _ring: CallQueue[] = [new CallQueue()];
	private _current: CallQueue = this._ring[0];
	private _flusher: () => void = (): void => this._scheduledFlush();
	private _flushing: boolean = false;
	private _scheduled: boolean = false;
	private _scheduler: (callback: () => void) => void = undefined;
	/* tslint:enable:member-ordering */

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
	 */
	public setScheduler(scheduler: (flusher: () => void) => void): void {
		/* tslint:disable:no-null-keyword */ // 'old' API told you to use `null` instead of `undefined`
		assert(scheduler === undefined || scheduler === null || typeof scheduler === "function");
		/* tslint:enable:no-null-keyword */
		this._scheduler = scheduler;
	}

	public enqueue(callback: (arg: any) => void, arg: any): void {
		if (!this._flushing && !this._scheduled) {
			this._schedule();
		}
		if (!this._current) {
			this._current = this._pool.pop();
			if (!this._current) {
				this._current = new CallQueue();
			}
			this._ring.push(this._current);
		}
		if (!this._current.push(callback, arg)) {
			this._current = undefined;
		}
	}

	public flush(): void {
		assert(!this._flushing, "cannot recursively flush");
		this._flushing = true;
		try {
			while (true) {
				// Note: ring is guaranteed to have at least one queue (even though
				// queue might be empty when flush() is e.g. called manually).
				this._ring[0].flush();

				// ring[0] is now guaranteed to be empty, so we could move it to
				// the pool.
				// However, if it's the last item remaining, better to simply
				// leave it in the ring, saves unnecessary re-move on next
				// enqueue.
				if (this._ring.length === 1) {
					// First queue is now empty, so we can re-use it again (if
					// it was full last time)
					this._current = this._ring[0];
					break;
				}

				assert(this._current !== this._ring[0]);
				this._pool.push(this._ring.shift());

				// Keep flushing queues in the ring, until only one (guaranteed
				// to be empty) queue remains, which is 'current'.
			}
		} finally {
			this._flushing = false;

			// If one of the callbacks in the queue throws an exception,
			// (e.g. when Promise#done() detects a rejection) make sure to
			// reschedule the remainder of the queue(s) for another iteration.
			// This approach has the advantage of immediately allowing to stop
			// the program in e.g. NodeJS, but also allows to continue running
			// correctly in a browser.
			if (this._ring[0].length > 0 && !this._scheduled) {
				this._schedule();
			}
		}
	}

	private _schedule(): void {
		assert(!this._scheduled);
		// Note: we 'fall back' to setImmediate here (instead of e.g.
		// assigning it to the _scheduler property once), to allow
		// setImmediate to be e.g. replaced by a mocked one (e.g. Sinon's
		// useFakeTimers())
		let scheduler = this._scheduler;
		if (!scheduler) {
			scheduler = typeof setImmediate === "function" ? setImmediate : setTimeout;
		}
		scheduler(this._flusher);
		this._scheduled = true;
	}

	private _scheduledFlush(): void {
		// Indicate that this 'iteration' of the flush is complete.
		this._scheduled = false;
		this.flush();
	}
}

export var async = new Async();
export default async;
