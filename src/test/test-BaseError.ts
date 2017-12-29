/**
 * Tests for BaseError class.
 *
 * Copyright (C) 2015 Martin Poelstra
 * License: MIT
 */

import "source-map-support/register";

import { expect } from "chai";
import BaseError from "../lib/BaseError";

describe("BaseError", () => {
	var e: BaseError;

	beforeEach(() => {
		e = new BaseError("MyBaseError", "my base error");
	});

	it("should fill in name and message", () => {
		expect(e.name).to.equal("MyBaseError");
		expect(e.message).to.equal("my base error");
	});

	it("should extend Error", () => {
		expect(e).to.be.instanceof(Error);
	});

	it("has a stack trace", () => {
		expect(typeof e.stack).to.equal("string");
	});

	// TODO Think of ways to properly test behavior on different platforms,
	// ideally merge it into the full coverage results.
});
