/**
 * Promise tests for functionality not covered by Promises A+ tests.
 *
 * Copyright (C) 2015 Martin Poelstra
 * License: MIT
 */

/// <reference path="../../typings/node/node.d.ts" />
/// <reference path="../../typings/mocha/mocha.d.ts" />
/// <reference path="../../typings/chai/chai.d.ts" />

"use strict";

require("source-map-support").install();

import assert = require("assert");
import chai = require("chai");
import { Promise, Thenable, UnhandledRejectionError } from "../lib/Promise";

import expect = chai.expect;

// TODO: Move Deferred to the lib itself some day

interface Deferred<T> {
	promise: Promise<T>;
	resolve: (value: T|Thenable<T>) => void;
	reject: (reason: Error) => void;
}

interface VoidDeferred extends Deferred<void> {
	resolve: (value?: void) => void;
}

function makeDeferred(): VoidDeferred;
function makeDeferred<T>(): Deferred<T>;
function makeDeferred(): Deferred<any> {
	var resolve: (v: any) => void;
	var reject: (r: Error) => void;
	var p = new Promise<any>((res, rej): void => {
		resolve = res;
		reject = rej;
	});
	return {
		promise: p,
		resolve: resolve,
		reject: reject
	};
}

describe("Promise", (): void => {

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
			function test(arg?: any) {
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
			var d1 = makeDeferred<number>();
			var d2 = makeDeferred<number>();
			setTimeout(() => d1.resolve(1), 10);
			setTimeout(() => d2.resolve(2), 20);
			return Promise.all([d1.promise, d2.promise]).then((results): void => {
				expect(results).to.deep.equal([1, 2]);
			});
		});
		it("should reject when one Promise fails", (): Promise<any> => {
			var d1 = makeDeferred<number>();
			var d2 = makeDeferred<number>();
			setTimeout(() => d1.reject(new Error("boom")), 10);
			setTimeout(() => d2.resolve(2), 20);
			return Promise.all([d1.promise, d2.promise]).catch((e: Error): void => {
				expect(e.message).to.contain("boom");
			});
		});
		it("should recursively resolve Thenables", () => {
			var results: number[];
			var d1 = makeDeferred<number>();
			var d2 = makeDeferred<number>();
			Promise.all([d1.promise, d2.promise]).then((r) => results = r);
			d1.resolve(d2.promise);
			Promise.flush();
			expect(results).to.be.undefined;
			d2.resolve(2);
			Promise.flush();
			expect(results).to.deep.equal([2, 2]);
		});
		it("should accept non-Thenables", () => {
			var results: number[];
			var d1 = makeDeferred<number>();
			Promise.all([d1.promise, 2]).then((r) => results = r);
			Promise.flush();
			expect(results).to.be.undefined;
			d1.resolve(1);
			Promise.flush();
			expect(results).to.deep.equal([1, 2]);
		});
		it("should accept non-Promise Thenables", () => {
			var results: number[];
			var callback: (n: number) => void;
			// Create rather dirty Promise-mock
			var thenable: Thenable<number> = {
				then: (cb: Function): Thenable<any> => { callback = <any>cb; return null; }
			}
			Promise.all([thenable]).then((r) => results = r);
			callback(42);
			expect(results).to.be.undefined;
			Promise.flush();
			expect(results).to.deep.equal([42]);
		});
	}); // .all()

	describe("#done()", (): void => {
		it("is silent on already resolved promise", (): void => {
			Promise.resolve(42).done();
			expect(Promise.flush).to.not.throw();
		});
		it("is silent on later resolved promise", (): void => {
			var d = makeDeferred<number>();
			d.promise.done();
			d.resolve(42);
			expect(Promise.flush).to.not.throw();
		});
		it("is silent when its fulfill callback returns non-Error", (): void => {
			Promise.resolve(42).done((v) => undefined);
			expect(Promise.flush).to.not.throw();
		});
		it("is silent when its fulfill callback returns non-Error Promise", (): void => {
			Promise.resolve(42).done((v) => Promise.resolve());
			expect(Promise.flush).to.not.throw();
		});
		it("is silent when its reject callback returns non-Error", (): void => {
			Promise.reject(new Error("boom")).done(null, (r) => undefined);
			expect(Promise.flush).to.not.throw();
		});
		it("is silent when its reject callback returns non-Error Promise", (): void => {
			Promise.reject(new Error("boom")).done(null, (r) => Promise.resolve());
			expect(Promise.flush).to.not.throw();
		});
		it("is silent when its reject callback returns non-Error Thenable", (): void => {
			var thenable: Thenable<void> = {
				then: (cb: Function): Thenable<any> => { cb(); return null; }
			}
			Promise.reject(new Error("boom")).done(null, (r) => thenable);
			expect(Promise.flush).to.not.throw();
		});
		it("should immediately break on thrown error", (): void => {
			Promise.reject(new Error("boom")).done();
			Promise.resolve().then((): void => {
				chai.assert(false, "Shouldn't get here");
			});
			expect(Promise.flush).to.throw(UnhandledRejectionError);
		});
		it("should immediately break on returned rejection", (): void => {
			var p = Promise.resolve();
			p.then((): Promise<void> => {
				return Promise.reject(new Error("boom"));
			}).done();
			expect(Promise.flush).to.throw(UnhandledRejectionError);
		});
		it("should immediately break on asynchronously rejected Thenable", (): void => {
			var d = makeDeferred();
			var p = Promise.resolve();
			p.then((): Promise<void> => {
				return d.promise;
			}).done();
			d.promise.then((): void => {
				console.log("ERROR");
				chai.assert(false, "Shouldn't get here");
			});
			Promise.flush();
			d.reject(new Error("boom"));
			expect(Promise.flush).to.throw(UnhandledRejectionError);
		});
	}); // #done()

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
				var stack = e.stack; // retrieve stack prop for coverage
				// TODO: Check stack trace
			});
			Promise.flush();
		});
		it("should trace returned rejections", () => {
			var p = Promise.resolve() // 1
				.then((): void => { // 2
					throw new Error("boom");
				}).then((): void => {
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
			Promise.resolve(42).done((v) => {});
			Promise.resolve(Promise.resolve(42));
			var d = makeDeferred<number>();
			Promise.resolve(d.promise);
			d.resolve(42);
			Promise.resolve({ then: (callback: Function) => {
				callback(42);
			}});
			Promise.flush();
			//console.log(traces);
		});
	}); // tracer
});
