/**
 * Promises A+ specification compliance tests.
 *
 * Copyright (C) 2015 Martin Poelstra
 * License: MIT
 */

import "source-map-support/register";

import { Deferred, Promise } from "../lib/Promise";

const adapter = {
	deferred: (): Deferred<any> => Promise.defer(),
	rejected: (reason: Error): Promise<any> => Promise.reject(reason),
	resolved: (value: any): Promise<any> => Promise.resolve(value),
};

function ureOff(): void {
	Promise.onPossiblyUnhandledRejection(false);
	Promise.onPossiblyUnhandledRejectionHandled(false);
}

function ureOn(): void {
	Promise.flush();
	Promise.onPossiblyUnhandledRejection(true);
	Promise.onPossiblyUnhandledRejectionHandled(true);
}

describe("Promises/A+ Tests", (): void => {
	before(ureOff);
	after(ureOn);

	/* tslint:disable:no-require-imports */
	ureOff();
	require("promises-aplus-tests").mocha(adapter);
	ureOn();
	/* tslint:enable:no-require-imports */
});
