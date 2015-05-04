/**
 * Tests for Trace.
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
import Trace from "../lib/Trace";

import expect = chai.expect;

describe("Trace", () => {
	it("lists caller first when created without arguments", () => {
		function test() {
			return new Trace();
		}
		var t = test();
		var lines = t.inspect().split("\n");
		expect(lines[0]).to.contain("at test (");
	});

	it("allows skipping calling functions", () => {
		function test1() {
			return test2();
		}
		function test2() {
			return test3();
		}
		function test3() {
			return new Trace(test2);
		}
		var t = test1();
		var lines = t.inspect().split("\n");
		expect(lines[0]).to.contain("at test1 (");
	});

	it("supports assigning a source trace", () => {
		function test1() {
			return new Trace();
		}
		function test2() {
			return new Trace();
		}

		var t = test1();
		t.setSource(test2());
		var lines = t.inspect().split("\n");
		expect(lines[0]).to.contain("at test1 (");
		var nextEventIndex = (lines.length - 1) / 2;
		expect(lines[nextEventIndex]).to.contain("from previous");
		expect(lines[nextEventIndex + 1]).to.contain("at test2 (");
	});

	it("overwrites previous source", () => {
		function test1() {
			return new Trace();
		}
		function test2() {
			return new Trace();
		}
		function test3() {
			return new Trace();
		}

		var t = test1();
		t.setSource(test2());
		t.setSource(test3());
		var lines = t.inspect().split("\n");
		expect(lines[0]).to.contain("at test1 (");
		var nextEventIndex = (lines.length - 1) / 2;
		expect(lines[nextEventIndex]).to.contain("from previous");
		expect(lines[nextEventIndex + 1]).to.contain("at test3 (");
	});

	it("limits trace depth", () => {
		function test1() {
			return new Trace();
		}
		function test2(t1: Trace) {
			var t2 = new Trace();
			t2.setSource(t1);
			return t2;
		}
		var t = test1();
		for (var i = 0; i < Trace.traceLimit + 1; i++) {
			t = test2(t);
		}
		expect(t.sources.length).to.equal(Trace.traceLimit);
	});

	it("supports recursive traces", () => {
		function test1() {
			return new Trace();
		}
		function test2() {
			return new Trace();
		}

		var t1 = test1();
		var t2 = test2();
		t1.setSource(t2);
		t2.setSource(t1);
		var lines = t2.inspect().split("\n");

		expect(lines[0]).to.contain("at test2 (");
		var nextEventIndex = (lines.length - 2) / 3;
		expect(lines[nextEventIndex]).to.contain("from previous");
		expect(lines[nextEventIndex + 1]).to.contain("at test1 (");

		nextEventIndex += nextEventIndex + 1;
		expect(lines[nextEventIndex]).to.contain("from previous");
		expect(lines[nextEventIndex + 1]).to.contain("at test2 (");
	});
});
