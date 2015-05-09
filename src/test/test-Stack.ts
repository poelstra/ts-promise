/**
 * Tests for Stack.
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
import Stack from "../lib/Stack";

import expect = chai.expect;

describe("Stack", () => {
	it("lists caller first when created without arguments", () => {
		function test() {
			return new Stack();
		}
		var s = test();
		var lines = s.inspect().split("\n");
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
			return new Stack(test2);
		}
		var s = test1();
		var lines = s.inspect().split("\n");
		expect(lines[0]).to.contain("at test1 (");
	});

	it("falls back to dummy trace when not supported"); // Think of way to change hasStacks
});
