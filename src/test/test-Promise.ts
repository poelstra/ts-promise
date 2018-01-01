/**
 * Promise tests for functionality not covered by Promises A+ tests.
 *
 * Copyright (C) 2015 Martin Poelstra
 * License: MIT
 */

/* tslint:disable:no-null-keyword */ // we're doing a lot of specific checks on behaviour on `null`

import * as sourceMapSupport from "source-map-support";
sourceMapSupport.install({
	handleUncaughtExceptions: false,
});

import { expect } from "chai";
import BaseError from "../lib/BaseError";
import { Deferred, Promise, Thenable, Trace, UnhandledRejection } from "../lib/index";
import EsPromise from "./espromise";

let boomError = new Error("boom");

function noop(): void {
	/* no-op */
}

describe("Promise", (): void => {

	beforeEach(() => {
		// Stuff with .done() is explicitly handled everywhere
		Promise.onUnhandledRejection(true);
		// Unhandled rejections are ignored in most tests, so disable
		// detection of them
		Promise.onPossiblyUnhandledRejection(false);
		Promise.onPossiblyUnhandledRejectionHandled(false);
	});

	afterEach(() => {
		// Back to defaults
		Promise.flush();
		Promise.onUnhandledRejection(true);
		Promise.onPossiblyUnhandledRejection(true);
		Promise.onPossiblyUnhandledRejectionHandled(true);
	});

	it("calls then()'s in a logical order", (): void => {
		var resolve: (v: number) => void;
		var p = new Promise((res: any, rej: any): void => {
			resolve = res;
		});
		var result: number[] = [];
		p.then((): void => { result.push(1); }).done((): void => { result.push(3); });
		p.then((): void => { result.push(2); }).done((): void => { result.push(4); });
		resolve(42);
		Promise.flush();
		expect(result).to.deep.equal([1, 2, 3, 4]);
	});

	describe("constructor()", () => {
		/*
		it("requires the `new` operator", () => {
			// Disabled, because:
			// - it requires the typeof checks in the constructor to be
			//   moved up (less efficient for the most common case)
			// - it requires the property initialization to be moved into the
			//   constructor (after the typeof checks)
			// - still doesn't protect that well, because ES6 imports are called
			//   with the module as their `this`
			// - Typescript already checks for it
			var constr = <any>Promise;
			expect(() => constr(function() { })).to.throw(TypeError);
			expect(() => constr(function() { })).to.throw("forget `new`");
		});
		*/
		it("requires a resolver function", () => {
			function test(arg?: any): void {
				expect(() => new Promise(arg)).to.throw(TypeError);
				expect(() => new Promise(arg)).to.throw("is not a function");
			}
			test();
			test(false);
			test(true);
			test({});
			test("");
		});
		it("returns a fulfilled promise when resolve is called", () => {
			var p = new Promise<number>((resolve, reject) => {
				resolve(42);
			});
			var result: number;
			p.then((v) => result = v);
			Promise.flush();
			expect(result).to.equal(42);
		});
		it("returns a rejected promise when reject is called", () => {
			var p = new Promise<number>((resolve, reject) => {
				reject(new Error("boom"));
			});
			var result: any;
			p.catch((r) => result = r);
			Promise.flush();
			expect(result).to.be.instanceof(Error);
		});
		it("returns a rejected promise when resolver throws", () => {
			var p = new Promise<number>((resolve, reject) => {
				throw new Error("boom");
			});
			var result: any;
			p.catch((r) => result = r);
			Promise.flush();
			expect(result).to.be.instanceof(Error);
		});
		it("returns a resolved promise when resolver throws after resolve is called", () => {
			var p = new Promise<number>((resolve, reject) => {
				resolve(42);
				throw new Error("boom");
			});
			var result: number;
			p.then((v) => result = v);
			Promise.flush();
			expect(result).to.be.equal(42);
		});
	}); // constructor()

	describe(".all()", (): void => {
		it("should resolve immediately for empty array", (): Promise<any> => {
			return Promise.all([]).then((results): void => {
				expect(results).to.deep.equal([]);
			});
		});
		it("should resolve with results after all Promises have resolved", (): Promise<any> => {
			var d1 = Promise.defer<number>();
			var d2 = Promise.defer<number>();
			setTimeout(() => d1.resolve(1), 10);
			setTimeout(() => d2.resolve(2), 20);
			return Promise.all([d1.promise, d2.promise]).then((results): void => {
				expect(results).to.deep.equal([1, 2]);
			});
		});
		it("should reject when one Promise fails", (): Promise<any> => {
			var d1 = Promise.defer<number>();
			var d2 = Promise.defer<number>();
			setTimeout(() => d1.reject(new Error("boom")), 10);
			setTimeout(() => d2.resolve(2), 20);
			return Promise.all([d1.promise, d2.promise]).catch((e: Error): void => {
				expect(e.message).to.contain("boom");
			});
		});
		it("should recursively resolve Thenables", () => {
			var results: number[];
			var d1 = Promise.defer<number>();
			var d2 = Promise.defer<number>();
			Promise.all([d1.promise, d2.promise]).then((r) => results = r);
			d1.resolve(d2.promise);
			Promise.flush();
			expect(results).to.equal(undefined);
			d2.resolve(2);
			Promise.flush();
			expect(results).to.deep.equal([2, 2]);
		});
		it("should accept non-Thenables", () => {
			var results: number[];
			var d1 = Promise.defer<number>();
			Promise.all([d1.promise, 2]).then((r) => results = r);
			Promise.flush();
			expect(results).to.equal(undefined);
			d1.resolve(1);
			Promise.flush();
			expect(results).to.deep.equal([1, 2]);
		});
		it("should accept non-Promise Thenables", () => {
			var results: number[];
			var callback: (n: number) => void;
			// Create rather dirty Promise-mock
			var thenable: Thenable<number> = {
				then: (cb: (n: number) => void): Thenable<any> => { callback = cb; return null; },
			};
			Promise.all([thenable]).then((r) => results = r);
			callback(42);
			expect(results).to.equal(undefined);
			Promise.flush();
			expect(results).to.deep.equal([42]);
		});
	}); // .all()

	describe(".race()", (): void => {
		it("should never resolve for empty array", (): void => {
			var p = Promise.race([]);
			Promise.flush();
			expect(p.isPending()).to.equal(true);
		});
		it("should resolve with first promise's result", (): Promise<any> => {
			var d1 = Promise.defer<number>();
			var d2 = Promise.defer<number>();
			setTimeout(() => d1.resolve(1), 20);
			setTimeout(() => d2.resolve(2), 10);
			return Promise.race([d1.promise, d2.promise]).then((result): void => {
				expect(result).to.deep.equal(2);
			});
		});
		it("should reject when one Promise fails", (): Promise<any> => {
			var d1 = Promise.defer<number>();
			var d2 = Promise.defer<number>();
			setTimeout(() => d1.reject(new Error("boom")), 10);
			setTimeout(() => d2.resolve(2), 20);
			return Promise.race([d1.promise, d2.promise]).catch((e: Error): void => {
				expect(e.message).to.contain("boom");
			});
		});
		it("should recursively resolve Thenables", () => {
			var result: number;
			var d1 = Promise.defer<number>();
			var d2 = Promise.defer<number>();
			Promise.race([d1.promise]).then((n) => result = n);
			d1.resolve(d2.promise);
			Promise.flush();
			expect(result).to.equal(undefined);
			d2.resolve(2);
			Promise.flush();
			expect(result).to.deep.equal(2);
		});
		it("should accept non-Thenables", () => {
			var result: number;
			var d1 = Promise.defer<number>();
			Promise.race([d1.promise, 2]).then((n) => result = n);
			Promise.flush();
			expect(result).to.equal(2);
		});
		it("should accept non-Promise Thenables", () => {
			var result: number;
			var callback: (n: number) => void;
			// Create rather dirty Promise-mock
			var thenable: Thenable<number> = {
				then: (cb: (n: number) => void): Thenable<any> => { callback = cb; return null; },
			};
			Promise.race([thenable]).then((n) => result = n);
			callback(42);
			expect(result).to.equal(undefined);
			Promise.flush();
			expect(result).to.equal(42);
		});
	}); // .race()

	describe(".resolve()", () => {
		it("should create a void promise without requiring an argument", () => {
			const p = Promise.resolve();
			Promise.flush();
			expect(p.value()).to.equal(undefined);
		});
		it("should easily accept Thenable<void>", () => {
			const t: Thenable<void> = Promise.resolve();
			const p: Promise<void> = Promise.resolve(t);
			Promise.flush();
			expect(p.value()).to.equal(undefined);
		});
		it("should easily accept Thenable<number>", () => {
			const t: Thenable<number> = Promise.resolve(42);
			const p: Promise<number> = Promise.resolve(t);
			Promise.flush();
			expect(p.value()).to.equal(42);
		});
		it("should easily accept standard ES2015 Promise<void>", (done) => {
			// Apparently, ES2015 promises aren't detected as being compatible
			// with our initial definition of a Thenable.
			// It lead to errors like "Type 'Promise<Promise<void>>' is not assignable
			// to type 'Promise<void>'. (...)"
			const esPromise = EsPromise.resolve();
			const p: Promise<void> = Promise.resolve(esPromise);
			p.done((n) => {
				expect(n).to.equal(undefined);
				done();
			});
		});
		it("should easily accept standard ES2015 Promise<number>", (done) => {
			// See comment in previous test for why this test is here.
			const esPromise = EsPromise.resolve(42);
			const p: Promise<number> = Promise.resolve(esPromise);
			p.done((n) => {
				expect(n).to.equal(42);
				done();
			});
		});
	});

	describe(".reject()", () => {
		it("should handle undefined stack without tracing", () => {
			// This can happen e.g. on "RangeError: Maximum call stack size exceeded",
			// (at least on node v0.10.26 it did)
			const e = new Error("boom");
			(<any>e).stack = undefined;
			const p = Promise.reject(e);
			Promise.flush();
			expect(p.reason()).to.be.instanceof(Error);
			expect(p.reason().stack).to.equal(undefined);
		});
		it("should handle undefined stack with tracing", () => {
			// This can happen e.g. on "RangeError: Maximum call stack size exceeded",
			// (at least on node v0.10.26 it did)
			const e = new Error("boom");
			(<any>e).stack = undefined;

			Promise.setLongTraces(true);
			const p = Promise.reject(e);
			Promise.setLongTraces(false);

			Promise.flush();
			expect(p.reason()).to.be.instanceof(Error);
			expect(p.reason().stack).to.equal(undefined);
		});
	});

	describe(".delay()", () => {
		it("resolves to void after given timeout, given no value", (done: MochaDone) => {
			var p = Promise.delay(10);
			Promise.flush();
			expect(p.isPending()).to.equal(true);
			p.then((v) => {
				expect(v).to.equal(undefined);
				done();
			});
		});
		it("resolves to a value after given timeout, given a value", (done: MochaDone) => {
			var p = Promise.delay(42, 10);
			Promise.flush();
			expect(p.isPending()).to.equal(true);
			p.then((v) => {
				expect(v).to.equal(42);
				done();
			});
		});
		it("resolves to a value after given timeout, given a Thenable", (done: MochaDone) => {
			var t = Promise.resolve(42);
			var p = Promise.delay(t, 10);
			Promise.flush();
			expect(p.isPending()).to.equal(true);
			p.then((v) => {
				expect(v).to.equal(42);
				done();
			});
		});
		it("immediately rejects, given a rejected Thenable", () => {
			var t = Promise.reject(new Error("boom"));
			var p = Promise.delay(t, 1000);
			Promise.flush();
			expect(p.isRejected()).to.equal(true);
			expect(p.reason().message).to.equal("boom");
		});
	});

	describe(".defer", () => {
		var d: Deferred<number>;
		beforeEach(() => {
			d = Promise.defer<number>();
		});
		it("is initially pending", () => {
			expect(d.promise.isPending()).to.equal(true);
		});
		it("it can be resolved once", () => {
			d.resolve(42);
			d.resolve(1);
			d.reject(new Error("boom"));
			Promise.flush();
			expect(d.promise.value()).to.equal(42);
		});
		it("it can be rejected once", () => {
			var e = new Error("boom");
			d.reject(e);
			d.resolve(1);
			d.reject(new Error("bla"));
			Promise.flush();
			expect(d.promise.reason()).to.equal(e);
		});
		it("it can be rejected using rejected Thenable", () => {
			var e = new Error("boom");
			var d2 = Promise.defer<number>();
			d.resolve(d2.promise);
			d.resolve(1);
			d.reject(new Error("bla"));
			Promise.flush();
			expect(d.promise.isPending()).to.equal(true);
			d2.reject(e);
			Promise.flush();
			expect(d.promise.reason()).to.equal(e);
		});
		it("VoidDeferred can be resolved using Thenable", () => {
			var d2 = Promise.defer();
			d2.resolve(Promise.resolve()); // Mostly for the TS typing
			Promise.flush();
			expect(d2.promise.isFulfilled()).to.equal(true);
		});
	});

	describe("#then()", () => {
		// All other cases already handled by Promise/A+ tests

		it("has correct typing for just fulfillment handler", () => {
			let p = Promise.resolve(42);
			let actual = p.then((n) => "foo");
			let expected: Promise<string>;
			expected = actual;
			actual = expected;
		});
		it("has correct typing for both handlers of same type, different from promise", () => {
			let p = Promise.resolve({});
			let actual = p.then(() => 42, (e) => 42);
			let expected: Promise<number>;
			expected = actual;
			actual = expected;
		});
		it("has correct typing for both handlers of same type, same as promise", () => {
			let p = Promise.resolve(42);
			let actual = p.then(() => 42, (e) => 42);
			let expected: Promise<number>;
			expected = actual;
			actual = expected;
		});
		it("has correct typing for both handlers of different type", () => {
			let p = Promise.resolve();
			let actual = p.then<string|number>(() => 42, (e) => "foo");
			let expected: Promise<string|number>;
			expected = actual;
			actual = expected;
		});
		it("has correct typing for just rejection handler of same type", () => {
			let p = Promise.resolve(42);
			let actual = p.then(undefined, (e) => 42);
			let expected: Promise<number>;
			expected = actual;
			actual = expected;
		});
		/* Can't get this to work yet. Seems that the void-type is matching too
		 * eagerly. So actual currently really resolves to Promise<string>,
		 * which is not correct. Luckily, this use-case won't happen that often,
		 * because one should be using `.catch()` instead.
		it("has correct typing for just rejection handler of different type", () => {
			let p = Promise.resolve(42);
			let actual = p.then(undefined, (e) => "foo");
			let expected: Promise<number|string>;
			expected = actual;
			actual = expected;
		});
		*/
		it("ignores no handlers, returns Promise of same type", () => {
			// Pathological case, only tested for correctness, typing requires
			// passing the callback
			let p = Promise.resolve(42);
			let actual = p.then<number>(undefined);
			let expected: Promise<number>;
			expected = actual;
			actual = expected;
			Promise.flush();
			expect(actual.value()).to.equal(42);
		});
	});

	describe("#catch()", () => {
		// All other cases already handled by Promise/A+ tests

		it("ignores no handler, returns Promise of same type", () => {
			// Pathological case, only tested for correctness, typing requires
			// passing the callback
			let p = Promise.resolve(42);
			let actual = p.catch<number>(undefined);
			let expected: Promise<number>;
			expected = actual;
			actual = expected;
			Promise.flush();
			expect(actual.value()).to.equal(42);
		});
		it("has correct typing for catch handler that returns same type", () => {
			let p = Promise.resolve(42);
			let actual = p.catch((n) => 1337);
			let expected: Promise<number>;
			expected = actual;
			actual = expected;
		});
		it("has correct typing for catch handler that returns different type", () => {
			let p = Promise.resolve(42);
			let actual = p.catch((n) => String(n));
			let expected: Promise<string|number>;
			expected = actual;
			actual = expected;
		});
		it("has correct typing for catch handler that only throws error", () => {
			let p = Promise.resolve(42);
			let actual = p.catch((n): number => { throw new Error("boom"); });
			let expected: Promise<number>;
			expected = actual;
			actual = expected;
		});
		it("has correct typing for catch handler that only returns rejection", () => {
			let p = Promise.resolve(42);
			let actual = p.catch(
				(n) => Promise.reject<number>(new Error("boom"))
			);
			let expected: Promise<number>;
			expected = actual;
			actual = expected;
		});

		describe("with predicate", () => {
			let plainError = new Error("boom");
			let unspecifiedError = new RangeError("boom");
			let specifiedError1 = new EvalError("boom");
			let specifiedError2 = new URIError("boom");
			let caughtSentinel = { caughtSentinel: true };
			function catcher(err: Error): any {
				return caughtSentinel;
			}
			function matcher(reason: Error): boolean {
				return reason instanceof EvalError;
			}
			it("catches specified Error", () => {
				let p = Promise.reject(plainError).catch(Error, catcher);
				Promise.flush();
				expect(p.value()).to.equal(caughtSentinel);
			});
			it("catches specified error", () => {
				let p = Promise.reject(specifiedError1).catch(EvalError, catcher);
				Promise.flush();
				expect(p.value()).to.equal(caughtSentinel);
			});
			it("passes unspecified error array", () => {
				let p = Promise.reject(unspecifiedError).catch(EvalError, catcher);
				Promise.flush();
				expect(p.reason()).to.equal(unspecifiedError);
			});
			it("catches specified error array", () => {
				let p1 = Promise.reject(specifiedError1).catch([EvalError, URIError], catcher);
				let p2 = Promise.reject(specifiedError2).catch([EvalError, URIError], catcher);
				Promise.flush();
				expect(p1.value()).to.equal(caughtSentinel);
				expect(p2.value()).to.equal(caughtSentinel);
			});
			it("passes unspecified error array", () => {
				let p = Promise.reject(unspecifiedError).catch([EvalError, URIError], catcher);
				Promise.flush();
				expect(p.reason()).to.equal(unspecifiedError);
			});
			it("passes empty error array", () => {
				let p = Promise.reject(unspecifiedError).catch([], catcher);
				Promise.flush();
				expect(p.reason()).to.equal(unspecifiedError);
			});
			it("catches function matches", () => {
				let p = Promise.reject(specifiedError1).catch(matcher, catcher);
				Promise.flush();
				expect(p.value()).to.equal(caughtSentinel);
			});
			it("passes function misses", () => {
				let p = Promise.reject(unspecifiedError).catch(matcher, catcher);
				Promise.flush();
				expect(p.reason()).to.equal(unspecifiedError);
			});
			it("rejects when testing invalid predicate", () => {
				let p1 = Promise.reject(unspecifiedError).catch(<any>"foo", catcher);
				let p2 = Promise.reject(unspecifiedError).catch(<any>undefined, catcher);
				let p3 = Promise.reject(unspecifiedError).catch(<any>null, catcher);
				let p4 = Promise.reject(unspecifiedError).catch(<any>{}, catcher);
				Promise.flush();
				expect(p1.reason()).to.be.instanceof(TypeError, "invalid predicate");
				expect(p2.reason()).to.be.instanceof(TypeError, "invalid predicate");
				expect(p3.reason()).to.be.instanceof(TypeError, "invalid predicate");
				expect(p4.reason()).to.be.instanceof(TypeError, "invalid predicate");
			});
			it("accepts various error classes as predicate", () => {
				let p1 = Promise.reject(new Error()).catch(Error, catcher);
				let p2 = Promise.reject(new BaseError("", "")).catch(BaseError, catcher);
				let p3 = Promise.reject(new UnhandledRejection(undefined, undefined)).catch(UnhandledRejection, catcher);
				Promise.flush();
				expect(p1.value()).to.equal(caughtSentinel);
				expect(p2.value()).to.equal(caughtSentinel);
				expect(p3.value()).to.equal(caughtSentinel);
			});
		});
	});

	describe("#finally()", (): void => {
		let called: Promise<number>;
		let p: Promise<number>;

		beforeEach(() => {
			called = undefined;
		});

		afterEach(() => {
			expect(called).to.equal(p);
		});

		describe("on fulfilled promise", () => {
			beforeEach(() => {
				p = Promise.resolve(42);
			});

			it("resolves to original value for void return", () => {
				let result = p.finally((resolved) => { called = resolved; });
				Promise.flush();
				expect(result.value()).to.equal(42);
			});

			it("waits for returned promise, then resolves to original value", () => {
				let d = Promise.defer();
				let result = p.finally((resolved) => { called = resolved; return d.promise; });
				Promise.flush();
				expect(result.isPending()).to.equal(true);
				expect(called).to.equal(p);

				d.resolve();
				Promise.flush();
				expect(result.value()).to.equal(42);
			});

			it("resolves to error on thrown error", () => {
				let result = p.finally((resolved) => {
					called = resolved;
					throw boomError;
				});
				Promise.flush();
				expect(result.reason()).to.equal(boomError);
			});

			it("resolves to error on rejected promise", () => {
				let result = p.finally((resolved) => {
					called = resolved;
					return Promise.reject(boomError);
				});
				Promise.flush();
				expect(result.reason()).to.equal(boomError);
			});
		});

		describe("on rejected promise", () => {
			let origErr = new Error("original error");

			beforeEach(() => {
				p = Promise.reject<number>(origErr);
			});

			it("resolves to original error for void return", () => {
				let result = p.finally((resolved) => { called = resolved; });
				Promise.flush();
				expect(result.reason()).to.equal(origErr);
			});

			it("waits for returned promise, then resolves to original error", () => {
				let d = Promise.defer();
				let result = p.finally((resolved) => { called = resolved; return d.promise; });
				Promise.flush();
				expect(result.isPending()).to.equal(true);
				expect(called).to.equal(p);

				d.resolve();
				Promise.flush();
				expect(result.reason()).to.equal(origErr);
			});

			it("resolves to new error on thrown error", () => {
				let result = p.finally((resolved) => {
					called = resolved;
					throw boomError;
				});
				Promise.flush();
				expect(result.reason()).to.equal(boomError);
			});

			it("resolves to new error on rejected promise", () => {
				let result = p.finally((resolved) => {
					called = resolved;
					return Promise.reject(boomError);
				});
				Promise.flush();
				expect(result.reason()).to.equal(boomError);
			});
		});
	});

	describe("#done()", (): void => {
		it("is silent on already resolved promise", (): void => {
			Promise.resolve(42).done();
			expect(() => Promise.flush()).to.not.throw();
		});
		it("is silent on later resolved promise", (): void => {
			var d = Promise.defer<number>();
			d.promise.done();
			d.resolve(42);
			expect(() => Promise.flush()).to.not.throw();
		});
		it("is silent when its fulfill callback returns non-Error", (): void => {
			Promise.resolve(42).done((v) => undefined);
			expect(() => Promise.flush()).to.not.throw();
		});
		it("is silent when its fulfill callback returns non-Error Promise", (): void => {
			Promise.resolve(42).done((v) => Promise.resolve());
			expect(() => Promise.flush()).to.not.throw();
		});
		it("is silent when its reject callback returns non-Error", (): void => {
			Promise.reject(new Error("boom")).done(null, (r) => undefined);
			expect(() => Promise.flush()).to.not.throw();
		});
		it("is silent when its reject callback returns non-Error Promise", (): void => {
			Promise.reject(new Error("boom")).done(null, (r) => Promise.resolve());
			expect(() => Promise.flush()).to.not.throw();
		});
		it("is silent when its reject callback returns non-Error Thenable", (): void => {
			var thenable: Thenable<void> = {
				then: (cb: (value?: void) => void): Thenable<any> => { cb(); return null; },
			};
			Promise.reject(new Error("boom")).done(null, (r) => thenable);
			expect(() => Promise.flush()).to.not.throw();
		});
		it("should immediately break on thrown error in normal callback", (): void => {
			var ready = false;
			Promise.resolve().done(() => { throw new Error("boom"); });
			Promise.resolve().then((): void => {
				ready = true;
			});
			expect(() => Promise.flush()).to.throw(UnhandledRejection);
			expect(ready).to.equal(false);
			Promise.flush();
			expect(ready).to.equal(true);
		});
		it("should immediately break on thrown error in error callback", (): void => {
			var ready = false;
			Promise.reject(new Error("dummy")).done(undefined, () => { throw new Error("boom"); });
			Promise.resolve().then((): void => {
				ready = true;
			});
			expect(() => Promise.flush()).to.throw(UnhandledRejection);
			expect(ready).to.equal(false);
			Promise.flush();
			expect(ready).to.equal(true);
		});
		it("should immediately break on returned rejection in callback", (): void => {
			Promise.resolve().done((): Promise<void> => {
				return Promise.reject(new Error("boom"));
			});
			expect(() => Promise.flush()).to.throw(UnhandledRejection);
		});
		it("should immediately break on asynchronously rejected Thenable", (): void => {
			var d = Promise.defer();
			Promise.resolve().done((): Promise<void> => {
				return d.promise;
			});
			Promise.flush();
			d.reject(new Error("boom"));
			expect(() => Promise.flush()).to.throw(UnhandledRejection);
		});
		it("should break on already rejected promise", (): void => {
			var ready = false;
			Promise.reject(new Error("boom")).done();
			Promise.resolve().then((): void => {
				ready = true;
			});
			expect(() => Promise.flush()).to.throw(UnhandledRejection);
			expect(ready).to.equal(false);
			Promise.flush();
			expect(ready).to.equal(true);
		});
		it("should break on asynchronously rejected Promise", (): void => {
			var d = Promise.defer();
			var p = Promise.resolve();
			p.then((): Promise<void> => {
				return d.promise;
			}).done();
			Promise.flush();
			d.reject(new Error("boom"));
			expect(() => Promise.flush()).to.throw(UnhandledRejection);
		});
		it("should support long traces on throw from callback", () => {
			Promise.setLongTraces(true);
			Promise.resolve().done(() => { throw new Error("boom"); });
			var caught: UnhandledRejection;
			try {
				Promise.flush();
			} catch (e) {
				caught = e;
			}
			expect(caught).to.be.instanceof(UnhandledRejection);
			// TODO: assert the trace property for correctness
			expect(caught.trace.inspect()).to.not.contain("no trace");
			Promise.setLongTraces(false);
		});
		it("should support long traces on throw from callback without non-long-trace source", () => {
			var p = Promise.resolve();
			Promise.setLongTraces(true);
			p.done(() => { throw new Error("boom"); });
			var caught: UnhandledRejection;
			try {
				Promise.flush();
			} catch (e) {
				caught = e;
			}
			expect(caught).to.be.instanceof(UnhandledRejection);
			// TODO: assert the trace property for correctness
			expect(caught.trace.inspect()).to.not.contain("no trace");
			Promise.setLongTraces(false);
		});
		it("should support long traces on rejection without callbacks", () => {
			Promise.setLongTraces(true);
			Promise.reject(new Error("boom")).done();
			var caught: UnhandledRejection;
			try {
				Promise.flush();
			} catch (e) {
				caught = e;
			}
			expect(caught).to.be.instanceof(UnhandledRejection);
			// TODO: assert the trace property for correctness
			expect(caught.trace.inspect()).to.not.contain("no trace");
			Promise.setLongTraces(false);
		});
		it("should mention there's no stack trace when there is none", () => {
			// This can happen e.g. on "RangeError: Maximum call stack size exceeded",
			// (at least on node v0.10.26 it did)
			Promise.resolve().then(() => {
				let e = new Error("boom");
				(<any>e).stack = undefined;
				throw e;
			}).done();
			var caught: UnhandledRejection;
			try {
				Promise.flush();
			} catch (e) {
				caught = e;
			}
			expect(caught).to.be.instanceof(UnhandledRejection);
			expect(caught.stack).to.equal("UnhandledRejection: Error: boom");
		});
	}); // #done()

	describe("#isFulfilled()", () => {
		it("is false while pending, true when fulfilled", () => {
			var d = Promise.defer();
			expect(d.promise.isFulfilled()).to.equal(false);
			Promise.flush();
			expect(d.promise.isFulfilled()).to.equal(false);
			d.resolve();
			expect(d.promise.isFulfilled()).to.equal(true);
			Promise.flush();
			expect(d.promise.isFulfilled()).to.equal(true);
		});
		it("is true when already fulfilled", () => {
			var p = Promise.resolve();
			expect(p.isFulfilled()).to.equal(true);
		});
		it("is false when rejected", () => {
			var p = Promise.reject(new Error("boom"));
			expect(p.isFulfilled()).to.equal(false);
		});
	});

	describe("#isRejected()", () => {
		it("is false while pending, true when rejected", () => {
			var d = Promise.defer();
			expect(d.promise.isRejected()).to.equal(false);
			Promise.flush();
			expect(d.promise.isRejected()).to.equal(false);
			d.reject(new Error("boom"));
			expect(d.promise.isRejected()).to.equal(true);
			Promise.flush();
			expect(d.promise.isRejected()).to.equal(true);
		});
		it("is true when already rejected", () => {
			var p = Promise.reject(new Error("boom"));
			expect(p.isRejected()).to.equal(true);
		});
		it("is false when fulfilled", () => {
			var p = Promise.resolve();
			expect(p.isRejected()).to.equal(false);
		});
	});

	describe("#isPending()", () => {
		it("is true while pending, false when resolved or rejected", () => {
			var d1 = Promise.defer();
			var d2 = Promise.defer();
			expect(d1.promise.isPending()).to.equal(true);
			expect(d2.promise.isPending()).to.equal(true);
			Promise.flush();
			expect(d1.promise.isPending()).to.equal(true);
			expect(d2.promise.isPending()).to.equal(true);
			d1.resolve();
			d2.reject(new Error("boom"));
			expect(d1.promise.isPending()).to.equal(false);
			expect(d2.promise.isPending()).to.equal(false);
			Promise.flush();
			expect(d1.promise.isPending()).to.equal(false);
			expect(d2.promise.isPending()).to.equal(false);
		});
		it("is false when already fulfilled", () => {
			var p = Promise.resolve();
			expect(p.isPending()).to.equal(false);
		});
		it("is false when already rejected", () => {
			var p = Promise.reject(new Error("boom"));
			expect(p.isPending()).to.equal(false);
		});
	});

	describe("#value()", () => {
		it("returns value when fulfilled", () => {
			var p = Promise.resolve(42);
			Promise.flush();
			expect(p.value()).to.equal(42);
		});
		it("throws an error while pending", () => {
			var p = Promise.defer().promise;
			Promise.flush();
			expect(() => p.value()).to.throw("not fulfilled");
		});
	});

	describe("#reason()", () => {
		it("returns reason when rejected", () => {
			var e = new Error("boom");
			var p = Promise.reject(e);
			Promise.flush();
			expect(p.reason()).to.equal(e);
		});
		it("throws an error while pending", () => {
			var p = Promise.defer().promise;
			Promise.flush();
			expect(() => p.reason()).to.throw("not rejected");
		});
	});

	describe("#toString()", () => {
		it("returns a readable representation for a pending Promise", () => {
			var p = Promise.defer().promise;
			expect(p.toString()).to.match(/^\[Promise \d+: pending\]$/);
		});
		it("returns a readable representation for a fulfilled Promise", () => {
			var p = Promise.resolve();
			expect(p.toString()).to.match(/^\[Promise \d+: fulfilled\]$/);
		});
		it("returns a readable representation for a rejected Promise", () => {
			var p = Promise.reject(new Error("boom"));
			expect(p.toString()).to.match(/^\[Promise \d+: rejected\]$/);
		});
		it("returns a readable representation for a Promise with invalid state", () => {
			// Just to cover the `default` switch case, which needs to be present for
			// ts-lint...
			var p = Promise.resolve();
			(<any>p)._state = -1;
			expect(p.toString()).to.match(/^\[Promise \d+: unknown\]$/);
		});
	});

	describe("#inspect()", () => {
		it("returns a readable representation for a pending Promise", () => {
			var p = Promise.defer().promise;
			expect(p.inspect()).to.match(/^\[Promise \d+: pending\]$/);
		});
		it("returns a readable representation for a fulfilled Promise", () => {
			var p = Promise.resolve();
			expect(p.inspect()).to.match(/^\[Promise \d+: fulfilled\]$/);
		});
		it("returns a readable representation for a rejected Promise", () => {
			var p = Promise.reject(new Error("boom"));
			expect(p.inspect()).to.match(/^\[Promise \d+: rejected\]$/);
		});
	});

	describe("#delay()", () => {
		it("resolves to same value after given timeout", (done: MochaDone) => {
			var p = Promise.resolve(42).delay(10);
			Promise.flush();
			expect(p.isPending()).to.equal(true);
			p.then((v) => {
				expect(v).to.equal(42);
				done();
			});
		});
		it("immediately passes a rejection", () => {
			var p = Promise.reject(new Error("boom")).delay(1000);
			Promise.flush();
			expect(p.isRejected()).to.equal(true);
			expect(p.reason().message).to.equal("boom");
		});
	});

	describe("#return()", () => {
		it("waits for parent, then resolves to value", () => {
			let d = Promise.defer();
			let actual = d.promise.return("foo");
			let expected: Promise<string>;
			expected = actual;
			actual = expected;

			Promise.flush();
			expect(actual.isPending()).to.equal(true);
			d.resolve();
			Promise.flush();
			expect(actual.value()).to.equal("foo");
		});
		it("waits for parent, allows resolving to void", () => {
			let d = Promise.defer();
			let actual = d.promise.return();
			let expected: Promise<void>;
			expected = actual;
			actual = expected;
			Promise.flush();
			expect(actual.isPending()).to.equal(true);
			d.resolve();
			Promise.flush();
			expect(actual.value()).to.equal(undefined);
		});
		it("waits for parent, then passes a rejection", () => {
			let e = new Error("boom");
			let d = Promise.defer();
			let actual = d.promise.return("foo");
			let expected: Promise<string>;
			expected = actual;
			actual = expected;
			Promise.flush();
			expect(actual.isPending()).to.equal(true);
			d.reject(e);
			Promise.flush();
			expect(actual.reason()).to.equal(e);
		});
	});

	describe("#throw()", () => {
		it("waits for parent, then rejects with reason", () => {
			let e = new Error("boom");
			let d = Promise.defer<string>();
			let actual = d.promise.throw(e);
			let expected: Promise<string>;
			expected = actual;
			actual = expected;

			Promise.flush();
			expect(actual.isPending()).to.equal(true);
			d.resolve("foo");
			Promise.flush();
			expect(actual.reason()).to.equal(e);
		});
		it("waits for parent, then passes a rejection", () => {
			let e = new Error("boom");
			let originalError = new Error("original");
			let d = Promise.defer<string>();
			let actual = d.promise.throw(e);
			let expected: Promise<string>;
			expected = actual;
			actual = expected;
			Promise.flush();
			expect(actual.isPending()).to.equal(true);
			d.reject(originalError);
			Promise.flush();
			expect(actual.reason()).to.equal(originalError);
		});
	});

	describe(".onUnhandledRejection()", (): void => {
		// Note: handlers are already put back to defaults in top-level afterEach

		it("supports custom handler", () => {
			let results: any[] = [];
			Promise.onUnhandledRejection((reason: any, doneTrace: Trace) => results.push({ reason, doneTrace }));
			Promise.reject(boomError).done();
			Promise.flush();
			expect(results.length).to.equal(1);
			expect(results[0].reason).to.equal(boomError);
			expect(results[0].doneTrace).to.be.instanceof(Trace);
		});

		it("supports disabling handler", () => {
			Promise.onUnhandledRejection(false);
			Promise.reject(boomError).done();
			Promise.flush();
		});

		it("supports re-enabling handler", () => {
			Promise.onUnhandledRejection(false);
			Promise.onUnhandledRejection(true);
			Promise.reject(boomError).done();
			expect(() => {
				Promise.flush();
			}).to.throw(UnhandledRejection);
		});

		it("throws on invalid input", () => {
			expect(() => Promise.onUnhandledRejection(undefined)).to.throw(TypeError);
			expect(() => Promise.onUnhandledRejection(null)).to.throw(TypeError);
			expect(() => Promise.onUnhandledRejection(<any>{})).to.throw(TypeError);
			expect(() => Promise.onUnhandledRejection(<any>42)).to.throw(TypeError);
		});
	});

	describe(".onPossiblyUnhandledRejection()", (): void => {
		// tslint:disable:object-literal-sort-keys

		// Note: handlers are already put back to defaults in top-level afterEach

		let nodeEvents: Array<{ reason: any, promise: Promise<any> }>;
		function nodeUnhandledRejectionHandler(reason: any, promise: Promise<any>): void {
			nodeEvents.push({ reason, promise });
		}
		beforeEach(() => {
			nodeEvents = [];
			process.on("unhandledRejection", nodeUnhandledRejectionHandler);
		});
		afterEach(() => {
			process.removeListener("unhandledRejection", nodeUnhandledRejectionHandler);
		});

		it("supports custom handler", () => {
			let results: Array<Promise<any>> = [];
			Promise.onPossiblyUnhandledRejection((promise: Promise<any>) => results.push(promise));
			const p = Promise.reject(boomError);
			Promise.flush();
			expect(results).to.deep.equal([p]);
		});

		it("supports disabling handler", () => {
			Promise.onPossiblyUnhandledRejection(false);
			Promise.reject(boomError);
			Promise.flush();
			expect(nodeEvents).to.deep.equal([]);
		});

		it("supports re-enabling handler", () => {
			Promise.onPossiblyUnhandledRejection(false);
			Promise.onPossiblyUnhandledRejection(true);
			const p = Promise.reject(boomError);
			Promise.flush();
			expect(nodeEvents).to.deep.equal([
				{ reason: boomError, promise: p },
			]);
		});

		it("throws on invalid input", () => {
			expect(() => Promise.onPossiblyUnhandledRejection(undefined)).to.throw(TypeError);
			expect(() => Promise.onPossiblyUnhandledRejection(null)).to.throw(TypeError);
			expect(() => Promise.onPossiblyUnhandledRejection(<any>{})).to.throw(TypeError);
			expect(() => Promise.onPossiblyUnhandledRejection(<any>42)).to.throw(TypeError);
		});

		// tslint:enable:object-literal-sort-keys
	});

	describe(".onPossiblyUnhandledRejectionHandled()", (): void => {
		// tslint:disable:object-literal-sort-keys

		// Note: handlers are already put back to defaults in top-level afterEach

		let nodeEvents: Array<{ promise: Promise<any> }>;
		function nodeRejectionHandledHandler(promise: Promise<any>): void {
			nodeEvents.push({ promise });
		}
		beforeEach(() => {
			nodeEvents = [];
			Promise.onPossiblyUnhandledRejection(false);
			process.on("rejectionHandled", nodeRejectionHandledHandler);
		});
		afterEach(() => {
			process.removeListener("rejectionHandled", nodeRejectionHandledHandler);
		});

		it("supports custom handler", () => {
			let results: Array<Promise<any>> = [];
			Promise.onPossiblyUnhandledRejectionHandled((promise: Promise<any>) => results.push(promise));
			const p = Promise.reject(boomError);
			Promise.flush();
			p.catch(noop);
			Promise.flush();
			expect(results).to.deep.equal([p]);
		});

		it("supports disabling handler", () => {
			Promise.onPossiblyUnhandledRejectionHandled(false);
			const p = Promise.reject(boomError);
			Promise.flush();
			p.catch(noop);
			Promise.flush();
			expect(nodeEvents).to.deep.equal([]);
		});

		it("supports re-enabling handler", () => {
			Promise.onPossiblyUnhandledRejectionHandled(false);
			Promise.onPossiblyUnhandledRejectionHandled(true);
			const p = Promise.reject(boomError);
			Promise.flush();
			p.catch(noop);
			Promise.flush();
			expect(nodeEvents).to.deep.equal([
				{ promise: p },
			]);
		});

		it("throws on invalid input", () => {
			expect(() => Promise.onPossiblyUnhandledRejectionHandled(undefined)).to.throw(TypeError);
			expect(() => Promise.onPossiblyUnhandledRejectionHandled(null)).to.throw(TypeError);
			expect(() => Promise.onPossiblyUnhandledRejectionHandled(<any>{})).to.throw(TypeError);
			expect(() => Promise.onPossiblyUnhandledRejectionHandled(<any>42)).to.throw(TypeError);
		});

		// tslint:enable:object-literal-sort-keys
	});

	describe("possibly unhandled rejections", (): void => {
		// tslint:disable:object-literal-sort-keys

		interface Event {
			type: "unhandled" | "handled" | "catch";
			promise: Promise<any>;
		}
		let events: Event[];

		beforeEach(() => {
			events = [];
			Promise.onPossiblyUnhandledRejection((promise) => events.push({ type: "unhandled", promise }));
			Promise.onPossiblyUnhandledRejectionHandled((promise) => events.push({ type: "handled", promise }));
		});

		it("should notify simple rejection", () => {
			const p = Promise.reject(boomError);
			Promise.flush();
			Promise.flush();
			expect(events).to.deep.equal([
				{ type: "unhandled", promise: p },
			]);
		});

		it("should not notify handled rejection", () => {
			const p = Promise.reject(boomError);
			p.catch(noop);
			Promise.flush();
			expect(events).to.deep.equal([]);
		});

		it("should notify late handled rejection", () => {
			const p = Promise.reject(boomError);
			Promise.flush();
			expect(events).to.deep.equal([
				{ type: "unhandled", promise: p },
			]);
			p.catch(() => events.push({ type: "catch", promise: undefined }));
			expect(events).to.deep.equal([
				{ type: "unhandled", promise: p },
			]);
			Promise.flush();
			expect(events).to.deep.equal([
				{ type: "unhandled", promise: p },
				{ type: "catch", promise: undefined },
				{ type: "handled", promise: p },
			]);
		});

		it("should not notify for parent when slave is handled (sync)", () => {
			const p1 = Promise.reject(boomError);
			const p2 = Promise.resolve(p1);
			p2.catch(noop);
			Promise.flush();
			expect(events).to.deep.equal([]);
		});

		it("should not notify for parent when slave is handled (async)", () => {
			const d1 = Promise.defer();
			const p2 = Promise.resolve(d1.promise);
			p2.catch(noop);
			d1.reject(boomError);
			Promise.flush();
			expect(events).to.deep.equal([]);
		});

		it("should not notify for parent when slave is unhandled (sync)", () => {
			const p1 = Promise.reject(boomError);
			const p2 = Promise.resolve(p1);
			Promise.flush();
			expect(events).to.deep.equal([
				{ type: "unhandled", promise: p2 },
			]);
		});

		it("should not notify for parent when slave is unhandled (async)", () => {
			const d1 = Promise.defer();
			const p1 = d1.promise;
			const p2 = Promise.resolve(p1);
			d1.reject(boomError);
			Promise.flush();
			expect(events).to.deep.equal([
				{ type: "unhandled", promise: p2 },
			]);
		});

		it("should not notify for parent when derived handles it (sync)", () => {
			const p1 = Promise.reject(boomError);
			const p2 = p1.then(noop);
			p2.catch(noop);
			Promise.flush();
			expect(events).to.deep.equal([]);
		});

		it("should not notify for parent when derived handles it (async)", () => {
			const d1 = Promise.defer();
			const p1 = d1.promise;
			const p2 = p1.then(noop);
			p2.catch(noop);
			d1.reject(boomError);
			Promise.flush();
			expect(events).to.deep.equal([]);
		});

		it("should not notify for parent when done() is handling it (sync)", () => {
			const p1 = Promise.reject(boomError);
			p1.done();
			expect(() => {
				Promise.flush();
			}).to.throw(UnhandledRejection);
			Promise.flush(); // just in case
			expect(events).to.deep.equal([]);
		});

		it("should not notify for parent when done() is handling it (async)", () => {
			const d1 = Promise.defer();
			const p1 = d1.promise;
			p1.done();
			d1.reject(boomError);
			expect(() => {
				Promise.flush();
			}).to.throw(UnhandledRejection);
			Promise.flush(); // just in case
			expect(events).to.deep.equal([]);
		});

		it("should not notify when suppressed", () => {
			const p1 = Promise.reject(boomError);
			p1.suppressUnhandledRejections();
			Promise.flush();
			expect(events).to.deep.equal([]);
		});

		it("should notify when suppressed late", () => {
			const p1 = Promise.reject(boomError);
			Promise.flush();
			expect(events).to.deep.equal([
				{ type: "unhandled", promise: p1 },
			]);
			p1.suppressUnhandledRejections();
			Promise.flush();
			expect(events).to.deep.equal([
				{ type: "unhandled", promise: p1 },
				{ type: "handled", promise: p1 },
			]);
		});

		// tslint:enable:object-literal-sort-keys
	});

	describe("long stack traces", (): void => {
		before(() => {
			Promise.setLongTraces(true);
		});
		after(() => {
			Promise.setLongTraces(false);
		});
		it("should trace simple rejections", () => {
			var p = Promise.resolve();  // this line should be present
			p.then((): void => { // this line should not be present
			});
			p.then((): void => { // this line should be present
			}).then((): void => { // this line should be present
				throw new Error("boom");
			}).then((): void => { // this line should not be present
			}).then((): void => { // this line should not be present
			}).catch((e: any): void => {
				/* tslint:disable:no-unused-variable */
				var stack = e.stack; // retrieve stack prop for coverage
				/* tslint:enable:no-unused-variable */
				// TODO: Check stack trace
			});
			Promise.flush();
		});
		it("should trace returned rejections", () => {
			var p = Promise.resolve() // 1
				.then((): void => { // 2
					throw new Error("boom");
				}).then((): void => {
					// empty
				});
			Promise.resolve()
				.then((): Promise<void> => { // 3?
					return p;
				}).catch((e: any): void => {
					// TODO: Check stack trace
				});
			Promise.flush();
		});
		it("should set the source of new Promise when it's created inside a then()-callback", () => {
			var p: Promise<void>;
			Promise.resolve() // 1
				.then((): void => { // 2
					p = Promise.resolve(); // 3
				}).then((): void => {
					// empty
				});
			Promise.flush();
			// TODO: Check stack trace if p
		});
	}); // long stack traces

	describe("tracer", () => {
		after(() => {
			Promise.setTracer(null);
		});
		// These tests are for getting full code coverage for now, results
		// should be tested later
		it("calls tracer when resolving", () => {
			var traces: string[] = [];
			Promise.setTracer((promise: Promise<any>, msg: string) => {
				traces.push(msg);
			});
			Promise.resolve(42).then((v) => {
				expect(v).to.equal(42);
			});
			Promise.reject(new Error("boom")).catch((r) => {
				expect(r).to.be.instanceof(Error);
			});
			Promise.resolve(42).done();
			Promise.resolve(42).done((v) => { /* empty */ });
			Promise.resolve(Promise.resolve(42));
			var d = Promise.defer<number>();
			Promise.resolve(d.promise);
			d.resolve(42);
			Promise.resolve({
				then: (callback: (n: number) => void): Thenable<number> => {
					callback(42);
					return this;
				},
			});
			Promise.flush();
		});
	}); // tracer
});
