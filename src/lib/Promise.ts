/**
 * Promise implementation in TypeScript.
 *
 * Copyright (C) 2015 Martin Poelstra
 * License: MIT
 */

"use strict"; /* istanbul ignore next */ // ignores Typescript's __extend() function

// TODO:
// - remove all "called = true"-type code in resolvers, replace by single check in _resolve()/_reject()
// - add .error(), catching only 'expected exceptions' (i.e. rejections, not thrown errors)
// - add possibility for an unhandled-rejections-handler
// - full coverage by unit tests
// - much more docs
// - try to remove mangling of Error's .stack property on rejections with longTraces enabled

import async from "./async";
import { assert } from "./util";
import Trace from "./Trace";
import BaseError from "./BaseError";

export interface Thenable<T> {
	then<R>(onFulfilled?: (value: T) => R|Thenable<R>, onRejected?: (reason: Error) => R|Thenable<R>): Thenable<R>;
}

export class UnhandledRejectionError extends BaseError {
	public reason: any;

	constructor(reason: any) {
		super("UnhandledRejectionError", "unhandled rejection: " + reason);
	}
}

var trace: (promise: Promise<any>, msg: string) => void = null;

var longTraces = false;

const enum State {
	Pending,
	Fulfilled,
	Rejected
}

/* istanbul ignore next */
function internalResolver(fulfill: (value: any) => void, reject: (reason: Error) => void): void {
	/* no-op, sentinel value */
}

interface GetThenError {
	error: any;
}

var getThenError: GetThenError = {
	error: undefined
};

function wrapNonError(a: any): Error {
	// This is basically a marker for the places where we need to check
	// handling of errors for .error() support.
	// A no-op for now.
	return a;
}

interface Resolver<T> {
	(resolve: (value: T|Thenable<T>) => void, reject: (reason: Error) => void): void;
}

interface ThenMethod<X, T> {
	(resolve: (value: X|Thenable<X>) => T|Thenable<T>, reject: (reason: Error) => T|Thenable<T>): void;
}

interface FulfillmentHandler<T, R> {
	(value: T|Thenable<T>): R|Thenable<R>;
}

interface RejectionHandler<R> {
	(reason: Error): R|Thenable<R>;
}

interface Handler<T, R> {
	promise: Promise<T>;
	onFulfilled: FulfillmentHandler<T, R>;
	onRejected: RejectionHandler<R>;
	slave: Promise<R>;
}

/**
 * Currently unwrapping promise, while running one of its then-callbacks.
 * Used to set the source of newly created promises.
 * We guarantee that at most one callback of a then() is running at any time.
 */
var unwrappingPromise: Promise<any> = undefined;

var promiseIdCounter = 0;

export class Promise<T> implements Thenable<T> {
	private _id = promiseIdCounter++;
	private _state: State = State.Pending;
	private _result: any = undefined; // Can be fulfillment value or rejection reason
	private _handlers: any[] = undefined;
	private _trace: Trace = undefined;

	constructor(
		resolver: (
			resolve: (value: T|Thenable<T>) => void,
			reject: (reason: Error) => void
		) => void
	) {
		trace && trace(this, "construct");
		if (longTraces) {
			this._trace = new Trace(Promise);
			if (unwrappingPromise) {
				this._setSource(unwrappingPromise);
			}
		}

		if (resolver === internalResolver) {
			// Internally created promises pass 'internalResolver', signalling
			// that resolving will be done by calling private methods on the
			// Promise. This saves having to create 2 closures.
			return;
		}

		if (typeof resolver !== "function") {
			throw new TypeError("Promise resolver is not a function");
		}

		var called = false;
		try {
			resolver(
				(y: T): void => {
					if (called) {
						// 2.3.3.3.3: If both `resolvePromise` and `rejectPromise` are called,
						// or multiple calls to the same argument are made, the first call
						// takes precedence, and any further calls are ignored.
						return;
					}
					// 2.3.3.3.1: If/when `resolvePromise` is called with value `y`,
					// run `[[Resolve]](promise, y)`
					called = true;
					this._resolve(y);
				},
				(r: Error): void => {
					if (called) {
						// 2.3.3.3.3: If both `resolvePromise` and `rejectPromise` are called,
						// or multiple calls to the same argument are made, the first call
						// takes precedence, and any further calls are ignored.
						return;
					}
					// 2.3.3.3.2: If/when `rejectPromise` is called with reason `r`,
					// reject `promise` with `r`
					called = true;
					this._reject(wrapNonError(r));
				}
			);
		} catch(e) {
			// 2.3.3.3.4: If calling `then` throws an exception `e`,
			// 2.3.3.3.4.1: If `resolvePromise` or `rejectPromise` have been called, ignore it.
			if (!called) {
				// 2.3.3.3.4.2: Otherwise, reject `promise` with `e` as the reason.
				this._reject(wrapNonError(e));
				called = true;
			}
		}
	}

	public then<R>(
		onFulfilled?: (value: T) => R|Thenable<R>,
		onRejected?: (reason: Error) => R|Thenable<R>
	): Promise<R> {
		trace && trace(this, `then(${typeof onFulfilled}, ${typeof onRejected})`);

		if (this._state === State.Fulfilled && typeof onFulfilled !== "function" ||
			this._state === State.Rejected && typeof onRejected !== "function") {
			// Optimization: handler is short-circuited, so pass the result (value/rejection)
			// through unmodified.
			// The typecast is safe, because we either have a fulfillment value
			// but no handler that could change the type, or a rejection without a
			// handler that could change it, so R === T in this case.
			// TODO: verify whether longTraces etc still work as expected
			return <Promise<any>>this;
		}

		// Construct new Promise, but use subclassed constructor, if any
		var slave = new (Object.getPrototypeOf(this).constructor)(internalResolver);
		slave._setSource(this);
		this._enqueue(slave, onFulfilled, onRejected);
		return slave;
	}

	public done<R>(
		onFulfilled?: (value: T) => void|Thenable<void>,
		onRejected?: (reason: Error) => void|Thenable<void>
	): void {
		if (this._state === State.Fulfilled && typeof onFulfilled !== "function") {
			return;
		}
		trace && trace(this, `done(${typeof onFulfilled}, ${typeof onRejected})`);
		this._enqueue(undefined, onFulfilled, onRejected);
	}

	public catch<R>(onRejected?: (reason: Error) => R|Thenable<R>): Promise<R> {
		return this.then(undefined, onRejected);
	}

	public isFulfilled(): boolean {
		return this._state === State.Fulfilled;
	}

	public isRejected(): boolean {
		return this._state === State.Rejected;
	}

	public isPending(): boolean {
		return this._state === State.Pending;
	}

	public value(): T {
		if (!this.isFulfilled()) {
			throw new Error("Promise is not fulfilled");
		}
		return this._result;
	}

	public reason(): any {
		if (!this.isRejected()) {
			throw new Error("Promise is not rejected");
		}
		return this._result;
	}

	public static resolve<R>(value: R|Thenable<R>): Promise<R>;
	public static resolve(): Promise<void>;
	public static resolve<R>(value?: R|Thenable<R>): Promise<void|R> {
		var p = new Promise(internalResolver);
		p._resolve(value);
		return p;
	}

	public static reject(reason: Error): Promise<any> {
		var p = new Promise(internalResolver);
		p._reject(reason);
		return p;
	}

	public static all<X>(thenables: (X|Thenable<X>)[]): Promise<X[]> {
		return new Promise<X[]>((resolve, reject): void => {
			assert(Array.isArray(thenables), "thenables must be an Array");
			if (thenables.length === 0) {
				resolve([]);
				return;
			}
			var result = new Array(thenables.length);
			var remaining = thenables.length;
			for (var i = 0; i < thenables.length; i++) {
				follow(thenables[i], i);
			}
			function follow(t: X|Thenable<X>, index: number): void {
				var slave: Promise<X> = t instanceof Promise ? t : Promise.resolve(t);
				slave.done(
					(v: X): void => {
						result[index] = v;
						remaining--;
						if (remaining === 0) {
							resolve(result);
						}
					},
					(reason: Error): void => reject(reason)
				);
			}
		});
	}

	public static setLongTraces(enable: boolean): void {
		longTraces = enable;
	}

	public static setTracer(tracer: (promise: Promise<any>, msg: string) => void): void {
		if (typeof tracer === "function") {
			trace = tracer;
		} else {
			trace = null;
		}
	}

	public static flush(): void {
		async.flush();
	}

	private _setSource(source: Promise<any>): void {
		if (!this._trace || !source._trace) {
			return;
		}
		this._trace.setSource(source._trace);
	}

	private _resolve(x: T|Thenable<T>): void {
		if (this._state !== State.Pending) {
			// 2.1.2.1 When fulfilled, a promise must not transition to any other state.
			// 2.1.3.1 When rejected, a promise must not transition to any other state.
			return;
		}
		if (!x) {
			// Shortcut for falsy values, most notably void-Promises
			// 2.3.4: If `x` is not an object or function, fulfill `promise` with `x`
			this._fulfill(<T>x);
			return;
		}
		// 2.3.1: If promise and x refer to the same object, reject promise with a TypeError as the reason.
		if (this === x) {
			this._reject(new TypeError("cannot resolve Promise to self"));
			return;
		}
		// 2.3.2: If `x` is a promise, adopt its state
		if (x instanceof Promise) {
			x._setSource(this);
			if (x._state === State.Pending) {
				// 2.3.2.1: If `x` is pending, `promise` must remain pending until `x` is fulfilled or rejected.
				this._followPromise(x);
			} else if (x._state === State.Fulfilled) {
				// 2.3.2.2: If/when `x` is fulfilled, fulfill `promise` with the same value.
				this._fulfill(x._result);
			} else {
				// 2.3.2.3: If/when `x` is rejected, reject `promise` with the same reason.
				this._reject(x._result);
			}
			return;
		}
		// 2.3.3: Otherwise, if `x` is an object or function,
		if (typeof x === "object" || typeof x === "function") {
			// 2.3.3.1: Let `then` be `x.then`
			var then: GetThenError|Resolver<T> = this._tryGetThen(x);
			// 2.3.3.2: If retrieving the property `x.then` results in a thrown
			// exception `e`, reject `promise` with `e` as the reason.
			if (then === getThenError) {
				this._reject(wrapNonError(getThenError.error));
				return;
			}
			// 2.3.3.3: If `then` is a function, call it with `x` as `this`,
			//          first argument `resolvePromise`, and second argument `rejectPromise`
			if (typeof then === "function") {
				this._followThenable(<Thenable<T>>x, <ThenMethod<any,T>>then);
				return;
			}
			// 2.3.3.4: If `then` is not a function, fulfill promise with `x`
		}
		// 2.3.4: If `x` is not an object or function, fulfill `promise` with `x`
		this._fulfill(<T>x);
	}

	private _tryGetThen(x: T|Thenable<T>): GetThenError|Resolver<T> {
		try {
			// 2.3.3.1: Let `then` be `x.then`
			var then = (<any>x).then;
			return then;
		} catch(e) {
			// 2.3.3.2: If retrieving the property `x.then` results in a thrown
			// exception `e`, reject `promise` with `e` as the reason.
			getThenError.error = e;
			return getThenError;
		}
	}

	private _fulfill(value: T): void {
		if (this._state !== State.Pending) {
			// 2.1.2.1 When fulfilled, a promise must not transition to any other state.
			// 2.1.3.1 When rejected, a promise must not transition to any other state.
			return;
		}

		trace && trace(this, `_fulfill(${typeof value})`);
		// 2.1.2.2 When fulfilled, a promise must have a value, which must not change.
		this._state = State.Fulfilled;
		this._result = value;
		this._flush();
	}

	private _reject(reason: Error): void {
		if (this._state !== State.Pending) {
			// 2.1.2.1 When fulfilled, a promise must not transition to any other state.
			// 2.1.3.1 When rejected, a promise must not transition to any other state.
			return;
		}

		trace && trace(this, `_reject(${reason})`);
		// 2.1.3.2 When rejected, a promise must have a reason, which must not change.
		this._state = State.Rejected;
		this._result = reason;
		if (this._trace && this._result instanceof Error && !this._result.trace) {
			this._result.trace = this._trace;
			// TODO: Meh, this always accesses '.stack', which is supposed to be expensive
			var originalStack = this._result.stack;
			Object.defineProperty(this._result, "stack", {
				enumerable: false,
				get: (): string => originalStack + "\n  from Promise at:\n" + this._trace.inspect()
			});
		}
		this._flush();
	}

	private _followPromise(slave: Promise<any>): void {
		if (this._state !== State.Pending) {
			// 2.1.2.1 When fulfilled, a promise must not transition to any other state.
			// 2.1.3.1 When rejected, a promise must not transition to any other state.
			return;
		}

		trace && trace(this, `_follow([Promise ${slave._id}])`);
		slave._enqueue(this, undefined, undefined);
	}

	private _followThenable(slave: Thenable<any>, then: Function): void {
		if (this._state !== State.Pending) {
			// 2.1.2.1 When fulfilled, a promise must not transition to any other state.
			// 2.1.3.1 When rejected, a promise must not transition to any other state.
			return;
		}

		trace && trace(this, "_follow([Thenable])");
		var called = false;
		try {
			// 2.3.3.3: If `then` is a function, call it with `x` as `this`,
			//          first argument `resolvePromise`, and second argument `rejectPromise`
			then.call(
				slave,
				(y: T): void => {
					if (called) {
						// 2.3.3.3.3: If both `resolvePromise` and `rejectPromise` are called,
						// or multiple calls to the same argument are made, the first call
						// takes precedence, and any further calls are ignored.
						return;
					}
					// 2.3.3.3.1: If/when `resolvePromise` is called with value `y`,
					// run `[[Resolve]](promise, y)`
					called = true;
					this._resolve(y);
				},
				(r: Error): void => {
					if (called) {
						// 2.3.3.3.3: If both `resolvePromise` and `rejectPromise` are called,
						// or multiple calls to the same argument are made, the first call
						// takes precedence, and any further calls are ignored.
						return;
					}
					// 2.3.3.3.2: If/when `rejectPromise` is called with reason `r`,
					// reject `promise` with `r`
					called = true;
					this._reject(wrapNonError(r));
				}
			);
		} catch(e) {
			// 2.3.3.3.4: If calling `then` throws an exception `e`,
			// 2.3.3.3.4.1: If `resolvePromise` or `rejectPromise` have been called, ignore it.
			if (!called) {
				// 2.3.3.3.4.2: Otherwise, reject `promise` with `e` as the reason.
				this._reject(wrapNonError(e));
				called = true;
			}
		}
	}

	private _enqueue(slave: Promise<any>, onFulfilled: FulfillmentHandler<T, any>, onRejected: RejectionHandler<any>): void {
		var h: Handler<T, any> = { promise: this, onFulfilled, onRejected, slave };
		if (this._state !== State.Pending) {
			async.enqueue(Promise._unwrapper, h);
		} else {
			if (!this._handlers) {
				this._handlers = [h];
			} else {
				var i = this._handlers.length;
				this._handlers[i] = h;
			}
		}
	}

	private _flush(): void {
		if (!this._handlers) {
			return;
		}
		var i = 0;
		var h = this._handlers;
		var l = h.length;
		this._handlers = undefined;
		while (i < l) {
			var handler = h[i];
			i++;

			if (handler.slave) {
				if (!handler.onFulfilled && !handler.onRejected) {
					// we're the return value of an onFulfilled, tell our
					// 'parent' to resolve
					if (this._state === State.Fulfilled) {
						handler.slave._fulfill(this._result);
					} else {
						handler.slave._reject(this._result);
					}
				} else {
					// .then() callbacks, including the returned promise from .then()
					async.enqueue(Promise._unwrapper, handler);
				}
			} else {
				// .done() callbacks
				async.enqueue(Promise._unwrapper, handler);
			}
		}
	}

	private _unwrap(handler: Handler<T, any>): void {
		var callback: (x: any) => any = this._state === State.Fulfilled ? handler.onFulfilled : handler.onRejected;
		var slave = handler.slave;
		if (!slave) {
			// Unwrap .done() callbacks
			trace && trace(this, `_unwrap()`);
			if (typeof callback !== "function") {
				// No callback: if we ended in a rejection, throw it, otherwise
				// all was good.
				if (this._state === State.Rejected) {
					throw new UnhandledRejectionError(this._result);
				}
				return;
			}
			assert(!unwrappingPromise);
			unwrappingPromise = this;
			// Don't try-catch, in order to let it break immediately
			try {
				var result = callback(this._result);
				if (!result) {
					// Common case: no result value
					return;
				}
				// May be a thenable, need to start following it...
				var p = (result instanceof Promise) ? result : Promise.resolve(result);
				p.done(); // Ensure it throws as soon as it's rejected
			} finally {
				unwrappingPromise = undefined;
			}
			return;
		}
		// Unwrap .then() calbacks
		trace && trace(this, `_unwrap(${slave._id})`);
		if (typeof callback === "function") {
			assert(!unwrappingPromise);
			unwrappingPromise = slave;
			try {
				// 2.2.5 handlers must be called as functions
				slave._resolve(callback(this._result));
			} catch(e) {
				slave._reject(wrapNonError(e));
			}
			unwrappingPromise = undefined;
		} else {
			if (this._state === State.Fulfilled) {
				slave._fulfill(this._result);
			} else {
				slave._reject(this._result);
			}
		}
	}

	private static _unwrapper(handler: Handler<any, any>): void {
		handler.promise._unwrap(handler);
	}
}

export default Promise;
