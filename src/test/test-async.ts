/**
 * Tests for async callback queue runner.
 *
 * Copyright (C) 2015 Martin Poelstra
 * License: MIT
 */

import "source-map-support/register";

import { expect } from "chai";
import async from "../lib/async";

describe("async", () => {
	afterEach(() => {
		async.setScheduler(undefined);
	});

	it("runs an async method", (done: MochaDone) => {
		async.enqueue(done, undefined);
	});

	it("uses alternate scheduler efficiently", (done: MochaDone) => {
		var called = 0;
		var flusher: () => void;
		async.setScheduler((f: () => void) => {
			called++;
			flusher = f;
		});
		expect(called).to.equal(0);

		// Enqueue first call, should trigger flush to be scheduled
		async.enqueue(() => { /* empty */ }, undefined);
		expect(called).to.equal(1);
		// Enqueue second, previous trigger still active
		async.enqueue(() => { /* empty */ }, undefined);
		expect(called).to.equal(1);
		// Flush using the scheduled flush, trigger 'deactivated'
		flusher();
		// Enqueue another, triggers another flush
		async.enqueue(() => { /* empty */ }, undefined);
		expect(called).to.equal(2);
		// Perform 'manual' flush, leaves existing trigger active
		async.flush();
		// Enqueue another, re-using existing trigger
		async.enqueue(done, undefined);
		expect(called).to.equal(2);
		// Execute the enqueued done callback
		flusher();
	});

	it("can reset scheduler to default, using null", (done: MochaDone) => {
		var called = 0;
		var flusher: () => void;
		async.setScheduler((f: () => void) => {
			called++;
			flusher = f;
		});
		async.enqueue(() => { /* empty */ }, undefined);
		expect(called).to.equal(1);
		flusher();

		/* tslint:disable:no-null-keyword */
		async.setScheduler(null); // old API behaviour for resetting
		/* tslint:enable:no-null-keyword */
		// The done callback should be scheduled and executed by default scheduler
		async.enqueue(done, undefined);
		expect(called).to.equal(1);
	});

	it("can reset scheduler to default, using undefined", (done: MochaDone) => {
		var called = 0;
		var flusher: () => void;
		async.setScheduler((f: () => void) => {
			called++;
			flusher = f;
		});
		async.enqueue(() => { /* empty */ }, undefined);
		expect(called).to.equal(1);
		flusher();

		async.setScheduler(undefined); // new API behaviour for resetting
		// The done callback should be scheduled and executed by default scheduler
		async.enqueue(done, undefined);
		expect(called).to.equal(1);
	});

	it("supports recursive scheduling", (done: MochaDone) => {
		// The number 600 seems rather arbitrary, but it's 'tuned' to use a
		// second callback queue, which happens after 1000/2=500 operations.
		// By using multiple queues (and storing 'old' ones in a pool), the
		// system efficiently supports recursive enqueues.
		for (let i = 0; i < 600; i++) {
			async.enqueue(() => { /* empty */ }, undefined);
		}
		async.enqueue(
			() => {
				// Add another round of many callbacks, which will 'overflow' the
				// second queue, reusing the first queue from the pool.
				for (let i = 0; i < 600; i++) {
					async.enqueue(() => { /* empty */ }, undefined);
				}
				// Signal we're done after this
				async.enqueue(done, undefined);
			},
			undefined
		);
	});

	it("allows async method to crash using manual flush, then still runs others", (done: MochaDone) => {
		async.enqueue(
			() => { throw new Error("boom"); },
			undefined
		);
		async.enqueue(done, undefined);
		expect(() => {
			async.flush();
		}).to.throw("boom");
	});

	it("allows async method to crash using automatic flush, then still runs others", (done: MochaDone) => {
		var flusher: () => void;
		var called = 0;
		async.setScheduler((f: () => void) => {
			called++;
			flusher = f;
		});
		async.enqueue(
			() => { throw new Error("boom"); },
			undefined
		);
		async.enqueue(done, undefined);
		expect(() => {
			expect(called).to.equal(1);
			flusher();
		}).to.throw("boom");
		expect(called).to.equal(2);
		flusher();
	});

	it("disallows recursive flush, still runs remaining", (done: MochaDone) => {
		async.enqueue(
			() => { async.flush(); },
			undefined
		);
		async.enqueue(done, undefined);
		expect(() => {
			async.flush();
		}).to.throw("cannot recursively flush");
	});

	it("allows overriding default scheduler by timer-stubbing libs (Sinon)", () => {
		var tasks: Array<(...args: any[]) => void> = [];
		var oldSetImmediate = global.setImmediate;
		global.setImmediate = (cb: (...args: any[]) => void, ...args: any[]): any => {
			tasks.push(cb);
		};
		var called = false;
		function test(): void { called = true; }
		async.enqueue(test, undefined);
		expect(called).to.equal(false);
		expect(tasks.length).to.equal(1);
		tasks[0]();
		expect(called).to.equal(true);
		global.setImmediate = oldSetImmediate;
	});

	it("falls back to setTimeout when setImmediate is not available", () => {
		const tasks: Array<(...args: any[]) => void> = [];
		const oldSetImmediate = global.setImmediate;
		const oldSetTimeout = global.setTimeout;
		delete global["setImmediate"]; // tslint:disable-line:no-string-literal
		global.setTimeout = (cb: (...args: any[]) => void, ms: number, ...args: any[]): any => {
			tasks.push(cb);
		};
		let called = false;
		function test(): void { called = true; }
		async.enqueue(test, undefined);
		expect(called).to.equal(false);
		expect(tasks.length).to.equal(1);
		tasks[0]();
		expect(called).to.equal(true);
		global.setImmediate = oldSetImmediate;
		global.setTimeout = oldSetTimeout;
	});

	describe("idle callbacks", () => {
		let results: string[];
		beforeEach(() => {
			results = [];
		});

		function cb(name: string): () => void {
			return () => results.push(name);
		}
		it("runs idle callback after normal callback", () => {
			async.enqueueIdle(cb("idle"));
			async.enqueue(cb("normal"));
			async.flush();
			expect(results).to.deep.equal(["normal", "idle"]);
		});

		it("runs idle callback after normal callback, when enqueueing normal from normal", () => {
			async.enqueueIdle(cb("idle"));
			async.enqueue(() => {
				results.push("normal");
				async.enqueue(cb("normal2"));
			});
			async.flush();
			expect(results).to.deep.equal(["normal", "normal2", "idle"]);
		});

		it("completes idle queue, then new normals, then new idles", () => {
			async.enqueueIdle(() => {
				results.push("idle1");
				async.enqueueIdle(cb("idle3"));
				async.enqueue(() => {
					results.push("normal2");
					async.enqueue(cb("normal4"));
					async.enqueueIdle(cb("idle5"));
				});
			});
			async.enqueueIdle(() => {
				results.push("idle2");
				async.enqueueIdle(cb("idle4"));
				async.enqueue(cb("normal3"));
			});
			async.enqueue(cb("normal1"));
			async.flush();
			expect(results).to.deep.equal([
				"normal1", "idle1", "idle2",
				"normal2", "normal3", "normal4", "idle3", "idle4", "idle5",
			]);
		});
	});
});
