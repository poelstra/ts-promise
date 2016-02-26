/**
 * Promise implementation in TypeScript.
 *
 * Copyright (C) 2015 Martin Poelstra
 * License: MIT
 */

"use strict"; /* istanbul ignore next */ // ignores Typescript's __extend() function

/* tslint:disable:no-unused-expression */ // prevent errors on `trace && trace(....)`

// TODO:
// - remove all "called = true"-type code in resolvers, replace by single check in _resolve()/_reject()
// - add possibility for an unhandled-rejections-handler
// - try to remove mangling of Error's .stack property on rejections with longTraces enabled

import async from "./async";
import { assert } from "./util";
import Trace from "./Trace";
import BaseError from "./BaseError";

export interface Thenable<T> {
	then<R>(onFulfilled?: (value: T) => R|Thenable<R>, onRejected?: (reason: Error) => R|Thenable<R>): Thenable<R>;
}

/**
 * A ts-promise implements the 'synchronous inspection' interface which allows
 * to synchronously determine the promise's current state.
 */
export interface Inspection<T> {
	/**
	 * @return `true` when promise is fulfilled, `false` otherwise.
	 */
	isFulfilled(): boolean;

	/**
	 * @return `true` when promise is rejected, `false` otherwise.
	 */
	isRejected(): boolean;

	/**
	 * @return `true` when promise is pending (may be resolved to another pending
	 *         promise), `false` otherwise.
	 */
	isPending(): boolean;

	/**
	 * @return Fulfillment value if fulfilled, otherwise throws an error.
	 */
	value(): T;

	/**
	 * @return Rejection reason if rejected, otherwise throws an error.
	 */
	reason(): any;
}

/**
 * Thrown when a rejected promise is explicitly terminated with `.done()`.
 */
export class UnhandledRejectionError extends BaseError {
	/**
	 * Original promise rejection reason.
	 */
	public reason: any;

	/**
	 * Trace of rejected promise.
	 */
	public trace: Trace;

	constructor(reason: any, trace: Trace) {
		super("UnhandledRejectionError", "unhandled rejection: " + reason);
		this.reason = reason;
		// TODO: Find a better way to merge the location of `.done()` in the
		// trace, because nobody will look for this property...
		this.trace = trace;
		// In case we have a reason, and it has a stack: use it instead of our
		// own stack, as it's more helpful to see where the original error was
		// thrown, than where it was thrown inside the promise lib.
		// In case we don't have a stack, explicitly state so, to not let people
		// chase a problem in the promise lib that isn't there...
		let stack: string = this.reason && typeof this.reason === "object" && this.reason.stack;
		if (typeof stack !== "string") {
			stack = String(reason);
		}
		this.stack = "UnhandledRejectionError: " + stack;
	}
}

var trace: (promise: Promise<any>, msg: string) => void = undefined;

var longTraces: boolean = false;

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
	error: undefined,
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

/**
 * Subscription to be notified when promise resolves.
 *
 * When a Handler is attached to an unresolved promise, it's added to its queue,
 * which is flushed as soon as the promise resolves.
 * When a Handler is attached to a resolved promise, it's scheduled immediately
 * (but still asynchronously).
 *
 * A Handler is used for 3 different cases:
 * 1. calling the onFulfilled/onRejected callbacks of .then()
 * 2. calling the onFulfilled/onRejected callbacks of .done()
 * 3. waiting for a promise returned from an onFulfilled/onRejected callback to
 *    be resolved (i.e. that promise is 'following' us)
 *
 * `promise` is always the promise that was resolved, i.e. the 'source'
 * onFulfilled/onRejected are the callbacks of the .then()/.done(), or both
 * `undefined` in case of a follower (case 3).
 * In all cases, `slave` is the promise that depends on our result, and/or the
 * callback's result.
 */
interface Handler<T, R> {
	promise: Promise<T>;
	onFulfilled: FulfillmentHandler<T, R>;
	onRejected: RejectionHandler<R>;
	slave: Promise<R>; // Will be undefined if done is truthy
	done: Trace; // Will be undefined if slave is truthy
}

var dummyDoneTrace = new Trace();

/**
 * Combination of a promise and its resolve/reject functions.
 * Created using Promise.defer().
 *
 * It is generally better (and slightly faster) to use the Promise
 * constructor to create a promise, as that will also catch any exception
 * thrown while running the resolver.
 *
 * A Deferred can be useful in some scenarios though, e.g. when working with
 * timers, protocol request/response pairs, etc.
 */
export interface Deferred<T> {
	/**
	 * Initially unresolved promise, resolved by the resolve or reject
	 * function on this object.
	 */
	promise: Promise<T>;

	/**
	 * Reject corresponding promise.
	 * The first call to either resolve or reject resolves the promise, any
	 * other calls are ignored.
	 * This function is a free function (i.e. not a 'method' on this object).
	 */
	reject: (reason: Error) => void;

	/**
	 * Resolve corresponding promise.
	 * The first call to either resolve or reject resolves the promise, any
	 * other calls are ignored.
	 * This function is a free function (i.e. not a 'method' on this object).
	 * Note: resolving with a rejected Thenable leads to a rejected promise.
	 */
	resolve: (value: T|Thenable<T>) => void;
}

/**
 * Convenience version of Deferred that allows calling resolve() without an
 * argument.
 *
 * Deferred is a combination of a promise and its resolve/reject functions.
 * Created using Promise.defer().
 *
 * It is generally better (and slightly faster) to use the Promise
 * constructor to create a promise, as that will also catch any exception
 * thrown while running the resolver.
 *
 * A Deferred can be useful in some scenarios though, e.g. when working with
 * timers, protocol request/response pairs, etc.
 */
export interface VoidDeferred extends Deferred<void> {
	/**
	 * Resolve corresponding promise.
	 * The first call to either resolve or reject resolves the promise, any
	 * other calls are ignored.
	 * This function is a free function (i.e. not a 'method' on this object).
	 * Note: resolving with a rejected Thenable leads to a rejected promise.
	 */
	resolve: (value?: void|Thenable<void>) => void;
}

/**
 * Currently unwrapping promise, while running one of its then-callbacks.
 * Used to set the source of newly created promises.
 * We guarantee that at most one callback of a then() is running at any time.
 */
var unwrappingPromise: Promise<any> = undefined;

var promiseIdCounter = 0;

/**
 * Generic Error class descriptor.
 *
 * Allows to pass classes to e.g. `Promise.catch()` which derive from Error.
 */
export interface ErrorClass {
	new (...args: any[]): Error;
}

/**
 * Fast, robust, type-safe promise implementation.
 */
export class Promise<T> implements Thenable<T>, Inspection<T> {
	private _id: number = promiseIdCounter++;
	private _state: State = State.Pending;
	private _result: any = undefined; // Can be fulfillment value or rejection reason
	private _handlers: Handler<T, any>[] = undefined;
	private _trace: Trace = undefined;

	/**
	 * Create new Promise.
	 *
	 * Pass a callback that will receive a `resolve()` and `reject()` function
	 * to seal the promise's fate.
	 *
	 * @param  resolver Called with resolve and reject functions
	 */
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
		} catch (e) {
			// 2.3.3.3.4: If calling `then` throws an exception `e`,
			// 2.3.3.3.4.1: If `resolvePromise` or `rejectPromise` have been called, ignore it.
			if (!called) {
				// 2.3.3.3.4.2: Otherwise, reject `promise` with `e` as the reason.
				called = true;
				this._reject(wrapNonError(e));
			}
		}
	}

	/**
	 * Run either `onFulfilled` or `onRejected` callbacks when the promise is
	 * resolved. Returns another promise for the return value of such a
	 * callback.
	 *
	 * The callback will always be called at most once, and always
	 * asynchronously (i.e. some time after e.g. the `resolver` passed to the
	 * constructor has resolved the promise).
	 *
	 * Any error thrown or rejected promise returned from a callback will cause
	 * the returned promise to be rejected with that error.
	 *
	 * If either or both callbacks are missing, the fulfillment or rejection is
	 * passed on unmodified.
	 *
	 * Use `.catch(onRejected)` instead of `.then(undefined, onRejected)` for
	 * stronger typing, better readability, and more functionality (predicates).
	 *
	 * @param onFulfilled Callback called with promise's fulfillment
	 *                    value iff promise is fulfilled. Callback can return
	 *                    another value or promise for a value.
	 * @param onRejected  Optional callback called with promise's rejection
	 *                    reason iff promise is rejected. Callback can return
	 *                    another value or promise for a value.
	 * @return Promise for value returned by either of the callbacks
	 */
	public then<R>(
		onFulfilled: (value: T) => R|Thenable<R>,
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
		this._enqueue(onFulfilled, onRejected, slave, undefined);
		return slave;
	}

	/**
	 * Run either `onFulfilled` or `onRejected` callbacks when the promise is
	 * resolved. If the callback throws an error or the returned value resolves
	 * to a rejection, the library will (asynchronously) throw an
	 * `UnhandledRejectionError` with that error.
	 *
	 * The callback will always be called at most once, and always
	 * asynchronously (i.e. some time after e.g. the `resolver` passed to the
	 * constructor has resolved the promise).
	 *
	 * @param onFulfilled Optional callback called with promise's fulfillment
	 *                    value iff promise is fulfilled. Any error thrown or
	 *                    rejection returned will cause an UnhandledRejectionError
	 *                    to be thrown.
	 * @param onRejected  Optional callback called with promise's rejection
	 *                    reason iff promise is rejected. Any error thrown or
	 *                    rejection returned will cause an UnhandledRejectionError
	 *                    to be thrown.
	 */
	public done<R>(
		onFulfilled?: (value: T) => void|Thenable<void>,
		onRejected?: (reason: Error) => void|Thenable<void>
	): void {
		trace && trace(this, `done(${typeof onFulfilled}, ${typeof onRejected})`);
		if (this._state === State.Fulfilled && typeof onFulfilled !== "function") {
			return;
		}

		let doneTrace = dummyDoneTrace;
		if (longTraces) {
			doneTrace = new Trace();
			if (this._trace) {
				doneTrace.setSource(this._trace);
			}
		}

		this._enqueue(onFulfilled, onRejected, undefined, doneTrace);
	}

	/**
	 * Catch all errors in case promise is rejected.
	 *
	 * The returned promise is resolved with the output of the callback, so it
	 * is possible to re-throw the error, but also to return a 'replacement'
	 * value that should be used instead.
	 *
	 * Convenience helper for `.then(undefined, onRejected)`.
	 *
	 * @param onRejected  Callback called with promise's rejection reason iff
	 *                    promise is rejected. Callback can return another value
	 *                    or promise for a value.
	 * @return Promise for original value, or 'replaced' value in case of error
	 */
	public catch<R>(onRejected: (reason: Error) => R|Thenable<R>): Promise<T|R>;
	/**
	 * Catch only errors of the specified class in case promise is rejected.
	 *
	 * The returned promise is resolved with the output of the callback, so it
	 * is possible to re-throw the error, but also to return a 'replacement'
	 * value that should be used instead.
	 *
	 * @param predicate   Error class to match (e.g. RangeError)
	 * @param onRejected  Callback called with promise's rejection reason iff
	 *                    promise is rejected. Callback can return another value
	 *                    or promise for a value.
	 * @return Promise for original value, or 'replaced' value in case of error
	 */
	public catch<R>(predicate: ErrorClass, onRejected: (reason: Error) => R|Thenable<R>): Promise<T|R>;
	/**
	 * Catch only errors of the specified classes in case promise is rejected.
	 *
	 * The returned promise is resolved with the output of the callback, so it
	 * is possible to re-throw the error, but also to return a 'replacement'
	 * value that should be used instead.
	 *
	 * @param predicate   Error classes to match (e.g. [RangeError, TypeError])
	 * @param onRejected  Callback called with promise's rejection reason iff
	 *                    promise is rejected. Callback can return another value
	 *                    or promise for a value.
	 * @return Promise for original value, or 'replaced' value in case of error
	 */
	public catch<R>(predicate: ErrorClass[], onRejected: (reason: Error) => R|Thenable<R>): Promise<T|R>;
	/**
	 * Catch only errors that match the predicate function in case promise is
	 * rejected.
	 * The callback will be called if the predicate function returns a truthy
	 * value for the given rejection reason.
	 *
	 * The returned promise is resolved with the output of the callback, so it
	 * is possible to re-throw the error, but also to return a 'replacement'
	 * value that should be used instead.
	 *
	 * @param predicate   If `predicate(reason)` returns true for given error,
	 *                    onRejected is called
	 * @param onRejected  Callback called with promise's rejection reason iff
	 *                    promise is rejected. Callback can return another value
	 *                    or promise for a value.
	 * @return Promise for original value, or 'replaced' value in case of error
	 */
	public catch<R>(predicate: (reason: Error) => boolean, onRejected: (reason: Error) => R|Thenable<R>): Promise<T|R>;
	/**
	 * Catch only errors that match predicate in case promise is rejected.
	 * Predicate can be an Error (sub-)class, array of Error classes, or a
	 * function that can return true to indicate a match.
	 *
	 * The returned promise is resolved with the output of the callback, so it
	 * is possible to re-throw the error, but also to return a 'replacement'
	 * value that should be used instead.
	 *
	 * @param predicate   Optional Error class, array of Error classes or match
	 *                    function
	 * @param onRejected  Callback called with promise's rejection reason iff
	 *                    promise is rejected. Callback can return another value
	 *                    or promise for a value.
	 * @return Promise for original value, or 'replaced' value in case of error
	 */
	public catch<R>(...args: any[]): Promise<T|R> {
		if (arguments.length === 1) {
			let onRejected: (reason: Error) => R|Thenable<R> = arguments[0];
			return this.then(undefined, onRejected);
		} else {
			let predicate: any = arguments[0];
			let onRejected: (reason: Error) => R|Thenable<R> = arguments[1];
			return this.then(undefined, (reason: Error) => {
				let match = false;
				if (typeof predicate === "function") {
					if (predicate.prototype instanceof Error || predicate === Error) {
						match = reason instanceof predicate;
					} else {
						match = predicate(reason);
					}
				} else if (Array.isArray(predicate)) {
					for (let i = 0; i < predicate.length; i++) {
						if (reason instanceof predicate[i]) {
							match = true;
							break;
						}
					}
				} else {
					throw new TypeError("invalid predicate to .catch(), got " + typeof predicate);
				}
				if (match) {
					return onRejected(reason);
				}
				return Promise.reject<T|R>(reason);
			});
		}
	}

	/**
	 * Asynchronous equivalent of try { } finally { }.
	 *
	 * Runs `handler` when promise resolves (fulfilled or rejected).
	 * Handler is passed the current promise (which is guaranteed to be
	 * resolved), and can be interrogated with e.g. `isFulfilled()`, `.value()`,
	 * etc.
	 *
	 * When `handler` returns `undefined` or its promise is fulfilled, the
	 * promise from `finally()` is resolved to the original promise's resolved
	 * value or rejection reason.
	 * If `handler` throws an error or returns a rejection, the result of
	 * `finally()` will be rejected with that error.
	 *
	 * Example:
	 * someLenghtyOperation().finally((result) => {
	 *   if (result.isFulfilled()) {
	 *     console.log("succeeded");
	 *   } else {
	 *     console.log("failed", result.reason());
	 *   }
	 * });
	 *
	 * @param  handler [description]
	 * @return promise with same value/reason as this one, after `handler`'s
	 *         result (if any) has been fulfilled, or a promise rejected with
	 *         `handler`'s error if it threw one or returned a rejection.
	 */
	public finally(handler: (result: Promise<T>) => void|Thenable<void>): Promise<T> {
		let runner = () => handler(this);
		return this.then(runner, runner).return(this);
	}

	/**
	 * @return `true` when promise is fulfilled, `false` otherwise.
	 */
	public isFulfilled(): boolean {
		return this._state === State.Fulfilled;
	}

	/**
	 * @return `true` when promise is rejected, `false` otherwise.
	 */
	public isRejected(): boolean {
		return this._state === State.Rejected;
	}

	/**
	 * @return `true` when promise is pending (may be resolved to another pending
	 *         promise), `false` otherwise.
	 */
	public isPending(): boolean {
		return this._state === State.Pending;
	}

	/**
	 * @return Fulfillment value if fulfilled, otherwise throws an error.
	 */
	public value(): T {
		if (!this.isFulfilled()) {
			throw new Error("Promise is not fulfilled");
		}
		return this._result;
	}

	/**
	 * @return Rejection reason if rejected, otherwise throws an error.
	 */
	public reason(): any {
		if (!this.isRejected()) {
			throw new Error("Promise is not rejected");
		}
		return this._result;
	}

	/**
	 * @return A human-readable representation of the promise and its status.
	 */
	public inspect(): string {
		return this.toString();
	}

	/**
	 * @return A human-readable representation of the promise and its status.
	 */
	public toString(): string {
		var state: string;
		switch (this._state) {
			case State.Pending: state = "pending"; break;
			case State.Fulfilled: state = "fulfilled"; break;
			case State.Rejected: state = "rejected"; break;
			default: state = "unknown";
		}
		return `[Promise ${this._id}: ${state}]`;
	}

	/**
	 * Create a promise that resolves with the same value of this promise, after
	 * `ms` milliseconds. The timer will start when the current promise is
	 * resolved.
	 * If the current promise is rejected, the resulting promise is also
	 * rejected, without waiting for the timer.
	 *
	 * @param ms Number of milliseconds to wait before resolving
	 * @return Promise that fulfills `ms` milliseconds after this promise fulfills
	 */
	public delay(ms: number): Promise<T> {
		return this.then((value: T) => {
			return new Promise<T>((resolve) => {
				setTimeout(() => resolve(value), ms);
			});
		});
	}

	/**
	 * Return a promise that resolves to `value` after this promise is
	 * fulfilled.
	 * Returned promise is rejected if this promise is rejected.
	 *
	 * Equivalent to `.then(() => value)`.
	 *
	 * @param value Value or promise for value of returned promise
	 * @return Promise resolved to value after this promise fulfills
	 */
	public return<R>(value: R|Thenable<R>): Promise<R>;
	/**
	 * Return a promise that resolves to `value` after this promise is
	 * fulfilled.
	 * Returned promise is rejected if this promise is rejected.
	 *
	 * Equivalent to `.then(() => value)`.
	 *
	 * @return Void promise resolved to value after this promise fulfills
	 */
	public return(): Promise<void>;
	/**
	 * Return a promise that resolves to `value` after this promise is
	 * fulfilled.
	 * Returned promise is rejected if this promise is rejected.
	 *
	 * Equivalent to `.then(() => value)`.
	 *
	 * @param value Value or promise for value of returned promise
	 * @return Promise resolved to value after this promise fulfills
	 */
	public return<R>(value?: R|Thenable<R>): Promise<R> {
		return this.then(() => value);
	}

	/**
	 * Return a promise that is rejected with `reason` after this promise is
	 * fulfilled.
	 * If this promise is rejected, returned promise will rejected with that
	 * error instead.
	 *
	 * Equivalent to `.then(() => { throw value; })`.
	 *
	 * @param reason Error reason to reject returned promise with
	 * @return Promise rejected with `reason` after this promise fulfills
	 */
	public throw(reason: Error): Promise<T> {
		return this.then(() => Promise.reject<T>(reason));
	}

	/**
	 * Create an immediately resolved promise (in case of a 'normal' value), or
	 * a promise that 'follows' another `Thenable` (e.g. a Promise from another
	 * library).
	 *
	 * @param value Value (or Thenable for value) for returned promise
	 * @return Promise resolved to `value`
	 */
	public static resolve<R>(value: R|Thenable<R>): Promise<R>;
	/**
	 * Create an immediately resolved void-promise.
	 *
	 * @return Promise resolved to void (i.e. `undefined`)
	 */
	public static resolve(): Promise<void>;
	/**
	 * Create an immediately resolved promise (in case of a 'normal' value), or
	 * a promise that 'follows' another `Thenable` (e.g. a Promise from another
	 * library).
	 *
	 * @param value Value (or Thenable for value) for returned promise
	 * @return Promise resolved to `value`
	 */
	public static resolve<R>(value?: R|Thenable<R>): Promise<void|R> {
		var p = new Promise(internalResolver);
		p._resolve(value);
		return p;
	}

	/**
	 * Create an immediately rejected void-promise.
	 *
	 * Note: to create a rejected promise of another type, use e.g.
	 * `Promise.reject<number>(myError)`
	 *
	 * @param reason Error object to set rejection reason
	 * @return Void promise resolved to rejection `reason`
	 */
	public static reject(reason: Error): Promise<void>;
	/**
	 * Create an immediately rejected promise.
	 *
	 * @param reason Error object to set rejection reason
	 * @return Promise resolved to rejection `reason`
	 */
	public static reject<T>(reason: Error): Promise<T>;
	/**
	 * Create an immediately rejected promise.
	 *
	 * Note: to create a rejected promise of a certain type, use e.g.
	 * `Promise.reject<number>(myError)`
	 *
	 * @param reason Error object to set rejection reason
	 * @return Promise resolved to rejection `reason`
	 */
	public static reject<T>(reason: Error): Promise<T> {
		var p = new Promise(internalResolver);
		p._reject(reason);
		return p;
	}

	/**
	 * Return a promise for an array of all resolved input promises (or values).
	 * If any of the input promises is rejected, the returned promise is
	 * rejected with that reason.
	 * When passing an empty array, the promises is immediately resolved to an
	 * empty array.
	 *
	 * @param thenables Array of values or promises for them
	 * @return promise that resolves with array of all resolved values
	 */
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

	/**
	 * Return a promise that resolves to the fulfillment or rejection of the
	 * first input promise that resolves.
	 * When passing an empty array, the promise will never resolve.
	 *
	 * @param thenables Array of values or promises for them
	 * @return promise that resolves to first resolved input promise
	 */
	public static race<X>(thenables: (X|Thenable<X>)[]): Promise<X> {
		return new Promise<X>((resolve, reject): void => {
			assert(Array.isArray(thenables), "thenables must be an Array");
			for (let i = 0; i < thenables.length; i++) {
				let t = thenables[i];
				let slave: Promise<X> = t instanceof Promise ? t : Promise.resolve(t);
				Promise.resolve(slave).done(resolve, reject);
			}
		});
	}

	/**
	 * Create tuple of a promise and its resolve and reject functions.
	 *
	 * It is generally better (and slightly faster) to use the Promise
	 * constructor to create a promise, as that will also catch any exception
	 * thrown while running the resolver.
	 *
	 * A Deferred can be useful in some scenarios though, e.g. when working with
	 * timers, protocol request/response pairs, etc.
	 *
	 * @return Deferred object, containing unresolved promise and its
	 *         resolve/reject functions
	 */
	public static defer(): VoidDeferred;
	/**
	 * Create tuple of a promise and its resolve and reject functions.
	 *
	 * It is generally better (and slightly faster) to use the Promise
	 * constructor to create a promise, as that will also catch any exception
	 * thrown while running the resolver.
	 *
	 * A Deferred can be useful in some scenarios though, e.g. when working with
	 * timers, protocol request/response pairs, etc.
	 *
	 * @return Deferred object, containing unresolved promise and its
	 *         resolve/reject functions
	 */
	public static defer<X>(): Deferred<X>;
	/**
	 * Create tuple of a promise and its resolve and reject functions.
	 *
	 * It is generally better (and slightly faster) to use the Promise
	 * constructor to create a promise, as that will also catch any exception
	 * thrown while running the resolver.
	 *
	 * A Deferred can be useful in some scenarios though, e.g. when working with
	 * timers, protocol request/response pairs, etc.
	 *
	 * @return Deferred object, containing unresolved promise and its
	 *         resolve/reject functions
	 */
	public static defer<X>(): Deferred<any> {
		var resolve: (v: any) => void;
		var reject: (r: Error) => void;
		var p = new Promise<any>((res, rej): void => {
			resolve = res;
			reject = rej;
		});
		return {
			promise: p,
			reject: reject,
			resolve: resolve,
		};
	}

	/**
	 * Create a promise that resolves to a void value (`undefined`) after `ms`
	 * milliseconds.
	 *
	 * @param ms Number of milliseconds to wait before resolving
	 * @return Promise that fulfills with a void value after `ms` milliseconds
	 */
	public static delay(ms: number): Promise<void>;
	/**
	 * Create a promise that resolves to the given value (or promise for a
	 * value) after `ms` milliseconds. The timer will start when the given value
	 * is resolved.
	 * If the input value is a rejected promise, the resulting promise is also
	 * rejected, without waiting for the timer.
	 *
	 * @param value Value or promise for value to be delayed
	 * @param ms Number of milliseconds to wait before resolving
	 * @return Promise that fulfills `ms` milliseconds after given (promise for)
	 *         value is fulfilled
	 */
	public static delay<R>(value: R|Thenable<R>, ms: number): Promise<R>;
	/**
	 * Create a promise that resolves to the given value (or promise for a
	 * value) after `ms` milliseconds. The timer will start when the given value
	 * is resolved.
	 * If the input value is a rejected promise, the resulting promise is also
	 * rejected, without waiting for the timer.
	 *
	 * @param value Value or promise for value to be delayed
	 * @param ms Number of milliseconds to wait before resolving
	 * @return Promise that fulfills `ms` milliseconds after given (promise for)
	 *         value is fulfilled
	 */
	public static delay<R>(...args: any[]): Promise<void|R> {
		if (arguments[1] === undefined) {
			// delay(ms)
			let ms = arguments[0];
			return new Promise<void>((resolve) => {
				setTimeout(resolve, ms);
			});
		}
		// delay(value, ms)
		return Promise.resolve(arguments[0]).delay(arguments[1]);
	}

	/**
	 * Enable or disable long stack trace tracking on promises.
	 *
	 * This allows tracing a promise chain through the various asynchronous
	 * actions in a program. For example, when a promise is rejected, the last
	 * few locations of any preceding promises are included in the error's stack
	 * trace.
	 *
	 * Note: it is possible to enable/disable long tracing at runtime.
	 *
	 * When chaining off of a promise that was created while tracing was enabled
	 * (e.g. through `.then()`), all children will also have long traces, even
	 * when tracing is turned off. This allows to trace just some promise paths.
	 *
	 * Tracing is disabled by default as it incurs a memory and performance
	 * overhead, although it's still faster with tracing than some major
	 * promise libraries without tracing, so don't worry too much about it.
	 *
	 * @param enable Set to true to enable long traces, false to disable
	 */
	public static setLongTraces(enable: boolean): void {
		longTraces = enable;
	}

	/**
	 * Set trace function that is called for internal state changes of a
	 * promise.
	 * Call with `undefined` or `null` to disable such tracing (this is the
	 * default).
	 *
	 * @param tracer Callback called for various stages during lifetime of a promise
	 */
	public static setTracer(tracer: (promise: Promise<any>, msg: string) => void): void {
		if (typeof tracer === "function") {
			trace = tracer;
		} else {
			trace = undefined;
		}
	}

	/**
	 * Recursively flush the async callback queue until all `.then()` and
	 * `.done()` callbacks for fulfilled and rejected Promises have been called.
	 * Useful in e.g. unit tests to advance program state to the next 'tick'.
	 *
	 * Note that if e.g. `.done()` encounters a rejected promise, `flush()` will
	 * immediately throw an error (e.g. `UnhandledRejectionError`).
	 * It is safe to call `flush()` again afterwards, but it will also be called
	 * automatically by the async queue on the next 'real' tick.
	 *
	 * It is an error to call `flush()` while it is already running (e.g. from
	 * a `.then()` callback).
	 */
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
		// 2.1.2.1 When fulfilled, a promise must not transition to any other state.
		// 2.1.3.1 When rejected, a promise must not transition to any other state.
		assert(this._state === State.Pending);

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
				this._followThenable(<Thenable<T>>x, <ThenMethod<any, T>>then);
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
		} catch (e) {
			// 2.3.3.2: If retrieving the property `x.then` results in a thrown
			// exception `e`, reject `promise` with `e` as the reason.
			getThenError.error = e;
			return getThenError;
		}
	}

	private _fulfill(value: T): void {
		// 2.1.2.1 When fulfilled, a promise must not transition to any other state.
		// 2.1.3.1 When rejected, a promise must not transition to any other state.
		assert(this._state === State.Pending);

		trace && trace(this, `_fulfill(${typeof value})`);
		// 2.1.2.2 When fulfilled, a promise must have a value, which must not change.
		this._state = State.Fulfilled;
		this._result = value;
		this._flush();
	}

	private _reject(reason: Error): void {
		// 2.1.2.1 When fulfilled, a promise must not transition to any other state.
		// 2.1.3.1 When rejected, a promise must not transition to any other state.
		assert(this._state === State.Pending);

		trace && trace(this, `_reject(${reason})`);
		// 2.1.3.2 When rejected, a promise must have a reason, which must not change.
		this._state = State.Rejected;
		this._result = reason;
		if (this._trace && this._result instanceof Error && !this._result.trace) {
			this._result.trace = this._trace;
			// TODO: Meh, this always accesses '.stack', which is supposed to be expensive
			var originalStack = this._result.stack;
			// Stack may be undefined if e.g. a Stack Overflow occurred
			if (originalStack) {
				Object.defineProperty(this._result, "stack", {
					enumerable: false,
					get: (): string => originalStack + "\n  from Promise at:\n" + this._trace.inspect(),
				});
			}
		}
		this._flush();
	}

	private _followPromise(slave: Promise<any>): void {
		// 2.1.2.1 When fulfilled, a promise must not transition to any other state.
		// 2.1.3.1 When rejected, a promise must not transition to any other state.
		assert(this._state === State.Pending);

		trace && trace(this, `_follow([Promise ${slave._id}])`);
		slave._enqueue(undefined, undefined, this, undefined);
	}

	private _followThenable(slave: Thenable<any>, then: Function): void {
		// 2.1.2.1 When fulfilled, a promise must not transition to any other state.
		// 2.1.3.1 When rejected, a promise must not transition to any other state.
		assert(this._state === State.Pending);

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
		} catch (e) {
			// 2.3.3.3.4: If calling `then` throws an exception `e`,
			// 2.3.3.3.4.1: If `resolvePromise` or `rejectPromise` have been called, ignore it.
			if (!called) {
				// 2.3.3.3.4.2: Otherwise, reject `promise` with `e` as the reason.
				called = true;
				this._reject(wrapNonError(e));
			}
		}
	}

	private _enqueue(
		onFulfilled: FulfillmentHandler<T, any>,
		onRejected: RejectionHandler<any>,
		slave: Promise<any>,
		done: Trace
	): void {
		var h: Handler<T, any> = {
			promise: this,
			onFulfilled,
			onRejected,
			slave,
			done,
		};
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

	/**
	 * Schedule any pending .then()/.done() callbacks and follower-promises to
	 * be called/resolved.
	 * Clears our queue, any callbacks/followers attached after this will be
	 * scheduled without going through our handlers queue.
	 */
	private _flush(): void {
		if (!this._handlers) {
			return;
		}
		var i = 0;
		var h = this._handlers;
		var l = h.length;
		this._handlers = undefined;
		while (i < l) {
			// Note: we enqueue every single callback/follower separately,
			// because e.g. .done() might throw and we need to ensure we can
			// continue after that. async handles that for us.
			// And because the queue needs to be processed in-order, we can't
			// 'filter' the non-callback operations out either.
			async.enqueue(Promise._unwrapper, h[i++]);
		}
	}

	/**
	 * 'Unwrap' a promise handler, i.e. call a .then()/.done() callback, or
	 * resolve a promise that's following us.
	 * @param handler The handler being processed
	 */
	private _unwrap(handler: Handler<T, any>): void {
		var callback: (x: any) => any = this._state === State.Fulfilled ? handler.onFulfilled : handler.onRejected;
		if (handler.done) {
			// Unwrap .done() callbacks
			trace && trace(this, `_unwrap()`);
			if (typeof callback !== "function") {
				// No callback: if we ended in a rejection, throw it, otherwise
				// all was good.
				if (this._state === State.Rejected) {
					let unhandled = new UnhandledRejectionError(this._result, handler.done);
					// TODO Allow intercepting these
					// Leave the comment after the throw: may show up in source line in node
					throw unhandled; // Unhandled exception caught by .done()
				}
				return;
			}
			assert(!unwrappingPromise);
			unwrappingPromise = this;
			try {
				var result = callback(this._result);
				if (result) { // skips the common cases like `undefined`
					// May be a thenable, need to start following it...
					var p = (result instanceof Promise) ? result : Promise.resolve(result);
					p.done(); // Ensure it throws as soon as it's rejected
				}
				unwrappingPromise = undefined;
			} catch (e) {
				unwrappingPromise = undefined;

				// Wrap in UnhandledRejectionError
				let unhandled = new UnhandledRejectionError(e, handler.done);
				// TODO Allow intercepting these
				// Leave the comment after the throw: may show up in source line in node
				throw unhandled; // Unhandled exception caught by .done()
			}
			return;
		}
		// Unwrap .then() callbacks, or resolve 'parent' promise
		//
		// Three scenarios are handled here:
		// 1. An onFulfilled callback was registered and promise is fulfilled,
		//    or onRejected callback was registered and promise is rejected
		//    -> callback is a function, slave is the promise that was returned
		//       from the .then() call, so resolve slave with outcome of callback
		// 2. An onFulfilled callback was registered but promise is rejected,
		//    or onRejected callback was registered but promise is fulfilled
		//    -> callback is not a function (typically `undefined`), slave is
		//       promise that was returned from the .then() call, so resolve it
		//       with our own result (thereby 'skipping' the .then())
		// 3. Another promise attached itself on our 'callback queue' to be
		//    resolved when we do (i.e. its fate is determined by us)
		//    -> callbacks will both be undefined, slave is that other promise
		//       that wants to be resolved with our result
		let slave = handler.slave;
		trace && trace(this, `_unwrap(${slave._id})`);
		if (typeof callback === "function") {
			// Case 1
			assert(!unwrappingPromise);
			unwrappingPromise = slave;
			try {
				// 2.2.5 handlers must be called as functions
				slave._resolve(callback(this._result));
			} catch (e) {
				slave._reject(wrapNonError(e));
			}
			unwrappingPromise = undefined;
		} else {
			// Case 2 and 3
			if (this._state === State.Fulfilled) {
				slave._fulfill(this._result);
			} else {
				slave._reject(this._result);
			}
		}
	}

	/**
	 * Helper for unwrapping promise handler.
	 * It's not a closure so it's cheap to schedule, and because it directly
	 * calls the _unwrap() method on a promise, it's (way) faster than having to
	 * use e.g. .call().
	 * @param handler The handler being processed
	 */
	private static _unwrapper(handler: Handler<any, any>): void {
		handler.promise._unwrap(handler);
	}
}

export default Promise;
