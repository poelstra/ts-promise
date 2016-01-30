/**
 * Tests for async callback queue runner.
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
import async from "../lib/async";

import expect = chai.expect;

describe("async", () => {
	afterEach(() => {
		async.setScheduler(null);
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
		async.enqueue(() => {}, undefined);
		expect(called).to.equal(1);
		// Enqueue second, previous trigger still active
		async.enqueue(() => {}, undefined);
		expect(called).to.equal(1);
		// Flush using the scheduled flush, trigger 'deactivated'
		flusher();
		// Enqueue another, triggers another flush
		async.enqueue(() => {}, undefined);
		expect(called).to.equal(2);
		// Perform 'manual' flush, leaves existing trigger active
		async.flush();
		// Enqueue another, re-using existing trigger
		async.enqueue(done, undefined);
		expect(called).to.equal(2);
		// Execute the enqueued done callback
		flusher();
	});

	it("can reset scheduler to default", (done: MochaDone) => {
		var called = 0;
		var flusher: () => void;
		async.setScheduler((f: () => void) => {
			called++;
			flusher = f;
		});
		async.enqueue(() => {}, undefined);
		expect(called).to.equal(1);
		flusher();

		async.setScheduler(null);
		// The done callback should be scheduled and executed by default scheduler
		async.enqueue(done, undefined);
		expect(called).to.equal(1);
	});

	it("supports recursive scheduling", (done: MochaDone) => {
		// The number 600 seems rather arbitrary, but it's 'tuned' to use a
		// second callback queue, which happens after 1000/2=500 operations.
		// By using multiple queues (and storing 'old' ones in a pool), the
		// system efficiently supports recursive enqueues.
		for (var i = 0; i < 600; i++) {
			async.enqueue(() => {}, undefined);
		}
		async.enqueue(() => {
			// Add another round of many callbacks, which will 'overflow' the
			// second queue, reusing the first queue from the pool.
			for (var i = 0; i < 600; i++) {
				async.enqueue(() => {}, undefined);
			}
			// Signal we're done after this
			async.enqueue(done, undefined);
		}, undefined);
	});

	it("allows async method to crash using manual flush, then still runs others", (done: MochaDone) => {
		async.enqueue(() => {
			throw new Error("boom");
		}, undefined);
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
		async.enqueue(() => {
			throw new Error("boom");
		}, undefined);
		async.enqueue(done, undefined);
		expect(() => {
			expect(called).to.equal(1);
			flusher();
		}).to.throw("boom");
		expect(called).to.equal(2);
		flusher();
	});

	it("disallows recursive flush, still runs remaining", (done: MochaDone) => {
		async.enqueue(() => {
			async.flush();
		}, undefined);
		async.enqueue(done, undefined);
		expect(() => {
			async.flush();
		}).to.throw("cannot recursively flush");
	});

	it("allows overriding default scheduler by timer-stubbing libs (Sinon)", () => {
		var tasks: Function[] = [];
		var oldSetImmediate = global.setImmediate;
		global.setImmediate = function(cb: (...args: any[]) => void, ...args: any[]): any {
			tasks.push(cb);
		};
		var called = false;
		function test() { called = true; }
		async.enqueue(test, undefined);
		expect(called).to.equal(false);
		expect(tasks.length).to.equal(1);
		tasks[0]();
		expect(called).to.equal(true);
		global.setImmediate = oldSetImmediate;
	});
});
