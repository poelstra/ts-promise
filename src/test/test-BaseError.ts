/**
 * Tests for BaseError class.
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
import BaseError from "../lib/BaseError";

import expect = chai.expect;

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

	it("falls back to dummy trace when not supported"); // Think of way to change hasStacks
});
