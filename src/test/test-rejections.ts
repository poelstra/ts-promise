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
import { UnhandledRejection } from "../lib/rejections";
import Trace from "../lib/Trace";

describe("rejections", () => {
	describe("UnhandledRejection", () => {
		describe("constructor()", () => {
			const e = new Error("boom");
			it("includes reason in message", () => {
				const ur = new UnhandledRejection(e, new Trace());
				expect(ur.message).to.contain("Error: boom");
			});
			it("sets its .reason property to the original error", () => {
				const ur = new UnhandledRejection(e, new Trace());
				expect(ur.reason).to.equal(e);
			});
			it("replaces its stack with that of original error", () => {
				const ur = new UnhandledRejection(e, new Trace());
				expect(ur.stack).to.contain((<any>e).stack);
			});
			it("does not crash if reason doesn't have a stack", () => {
				/* tslint:disable:no-unused-variable */
				const ur1 = new UnhandledRejection(undefined, new Trace());
				const ur2 = new UnhandledRejection(null, new Trace());
				const ur3 = new UnhandledRejection({}, new Trace());
				/* tslint:enable:no-unused-variable */
			});
		});
	});
});
