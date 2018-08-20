/**
 * Tests for Trace.
 *
 * Copyright (C) 2015 Martin Poelstra
 * License: MIT
 */

import "source-map-support/register";

import { expect } from "chai";
import Trace from "../lib/Trace";

describe("Trace", () => {
	it("lists caller first when created without arguments", () => {
		function test(): Trace {
			return new Trace();
		}
		const t = test();
		const lines = t.inspect().split("\n");
		expect(lines[0]).to.contain("at test (");
	});

	it("allows skipping calling functions", () => {
		function test1(): Trace {
			return test2();
		}
		function test2(): Trace {
			return test3();
		}
		function test3(): Trace {
			return new Trace(test2);
		}
		const t = test1();
		const lines = t.inspect().split("\n");
		expect(lines[0]).to.contain("at test1 (");
	});

	it("supports assigning a source trace", () => {
		function test1(): Trace {
			return new Trace();
		}
		function test2(): Trace {
			return new Trace();
		}

		const t = test1();
		t.setSource(test2());
		const lines = t.inspect().split("\n");
		expect(lines[0]).to.contain("at test1 (");
		const nextEventIndex = (lines.length - 1) / 2;
		expect(lines[nextEventIndex]).to.contain("from previous");
		expect(lines[nextEventIndex + 1]).to.contain("at test2 (");
	});

	it("overwrites previous source", () => {
		function test1(): Trace {
			return new Trace();
		}
		function test2(): Trace {
			return new Trace();
		}
		function test3(): Trace {
			return new Trace();
		}

		const t = test1();
		t.setSource(test2());
		t.setSource(test3());
		const lines = t.inspect().split("\n");
		expect(lines[0]).to.contain("at test1 (");
		const nextEventIndex = (lines.length - 1) / 2;
		expect(lines[nextEventIndex]).to.contain("from previous");
		expect(lines[nextEventIndex + 1]).to.contain("at test3 (");
	});

	it("limits trace depth", () => {
		function test1(): Trace {
			return new Trace();
		}
		function test2(t1: Trace): Trace {
			const t2 = new Trace();
			t2.setSource(t1);
			return t2;
		}
		let t = test1();
		for (let i = 0; i < Trace.traceLimit + 1; i++) {
			t = test2(t);
		}
		expect(t.sources!.length).to.equal(Trace.traceLimit);
	});

	it("supports recursive traces", () => {
		function test1(): Trace {
			return new Trace();
		}
		function test2(): Trace {
			return new Trace();
		}

		const t1 = test1();
		const t2 = test2();
		t1.setSource(t2);
		t2.setSource(t1);
		const lines = t2.inspect().split("\n");

		expect(lines[0]).to.contain("at test2 (");
		let nextEventIndex = (lines.length - 2) / 3;
		expect(lines[nextEventIndex]).to.contain("from previous");
		expect(lines[nextEventIndex + 1]).to.contain("at test1 (");

		nextEventIndex += nextEventIndex + 1;
		expect(lines[nextEventIndex]).to.contain("from previous");
		expect(lines[nextEventIndex + 1]).to.contain("at test2 (");
	});
});
