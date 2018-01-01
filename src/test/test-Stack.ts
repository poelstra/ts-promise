/**
 * Tests for Stack.
 *
 * Copyright (C) 2015 Martin Poelstra
 * License: MIT
 */

import "source-map-support/register";

import { expect } from "chai";
import Stack from "../lib/Stack";

describe("Stack", () => {
	it("lists caller first when created without arguments", () => {
		function test(): Stack {
			return new Stack();
		}
		const s = test();
		const lines = s.inspect().split("\n");
		expect(lines[0]).to.contain("at test (");
	});

	it("allows skipping calling functions", () => {
		function test1(): Stack {
			return test2();
		}
		function test2(): Stack {
			return test3();
		}
		function test3(): Stack {
			return new Stack(test2);
		}
		const s = test1();
		const lines = s.inspect().split("\n");
		expect(lines[0]).to.contain("at test1 (");
	});

	it("falls back to dummy trace when not supported"); // Think of way to change hasStacks
});
