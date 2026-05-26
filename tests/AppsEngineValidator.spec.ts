import { expect } from "chai";
import { describe, it, beforeEach, afterEach } from "mocha";
import sinon from "sinon";

import { AppsEngineValidator } from "../src/compiler/AppsEngineValidator";

const OLD_PERMISSIONS_PATH =
    "@rocket.chat/apps-engine/server/permissions/AppPermissions";
const NEW_PERMISSIONS_PATH =
    "@rocket.chat/apps-engine/definition/metadata/AppPermissions";
const OLD_INTERFACE_PATH = "@rocket.chat/apps-engine/definition/metadata";
const NEW_INTERFACE_PATH =
    "@rocket.chat/apps-engine/server/compiler/AppImplements";

const mockAppPermissions = {
    network: {
        write: { name: "networking.write" },
        read: { name: "networking.read" },
    },
    env: {
        read: { name: "env.read" },
    },
};

function makeRequire(moduleMap: Record<string, any>): NodeJS.Require {
    const fn = (id: string) => {
        if (id in moduleMap) {
            return moduleMap[id];
        }
        throw new Error(`Cannot find module '${id}'`);
    };
    fn.resolve = () => {
        throw new Error("not implemented");
    };
    fn.cache = {};
    fn.extensions = {};
    fn.main = undefined;
    return fn as unknown as NodeJS.Require;
}

describe("AppsEngineValidator", () => {
    let warnStub: sinon.SinonStub;

    beforeEach(() => {
        warnStub = sinon.stub(console, "warn");
    });

    afterEach(() => {
        sinon.restore();
    });

    describe("validateAppPermissionsSchema", () => {
        it("returns early when permissions is falsy", () => {
            const validator = new AppsEngineValidator(makeRequire({}));
            expect(() =>
                validator.validateAppPermissionsSchema(null as any),
            ).not.to.throw();
        });

        it("throws when permissions is not an array", () => {
            const validator = new AppsEngineValidator(makeRequire({}));
            expect(() =>
                validator.validateAppPermissionsSchema({} as any),
            ).to.throw("Invalid permission definition");
        });

        it("logs a warning and skips validation when neither permissions module path resolves", () => {
            const validator = new AppsEngineValidator(makeRequire({}));
            validator.validateAppPermissionsSchema([
                { name: "networking.write" },
            ]);
            expect(warnStub.calledOnce).to.be.true;
            expect(warnStub.firstCall.args[0]).to.include(
                "Failed to read available permissions",
            );
        });

        it("validates permissions using the old module path", () => {
            const require = makeRequire({
                [OLD_PERMISSIONS_PATH]: { AppPermissions: mockAppPermissions },
            });
            const validator = new AppsEngineValidator(require);
            expect(() =>
                validator.validateAppPermissionsSchema([
                    { name: "networking.write" },
                ]),
            ).not.to.throw();
        });

        it("falls back to new module path when old path is not found", () => {
            const require = makeRequire({
                [NEW_PERMISSIONS_PATH]: { AppPermissions: mockAppPermissions },
            });
            const validator = new AppsEngineValidator(require);
            expect(() =>
                validator.validateAppPermissionsSchema([{ name: "env.read" }]),
            ).not.to.throw();
        });

        it("throws for an invalid permission name", () => {
            const require = makeRequire({
                [OLD_PERMISSIONS_PATH]: { AppPermissions: mockAppPermissions },
            });
            const validator = new AppsEngineValidator(require);
            expect(() =>
                validator.validateAppPermissionsSchema([
                    { name: "not.a.real.permission" },
                ]),
            ).to.throw('Invalid permission "not.a.real.permission"');
        });

        it("skips null/undefined entries in the permissions array", () => {
            const require = makeRequire({
                [OLD_PERMISSIONS_PATH]: { AppPermissions: mockAppPermissions },
            });
            const validator = new AppsEngineValidator(require);
            expect(() =>
                validator.validateAppPermissionsSchema([
                    null as any,
                    undefined as any,
                    { name: "networking.write" },
                ]),
            ).not.to.throw();
        });
    });

    describe("isValidAppInterface", () => {
        const mockAppInterface = {
            IPreMessageSentPrevent: "IPreMessageSentPrevent",
            IPostMessageSent: "IPostMessageSent",
        };

        it("returns true for a known interface using the primary module path", () => {
            const require = makeRequire({
                [OLD_INTERFACE_PATH]: { AppInterface: mockAppInterface },
            });
            const validator = new AppsEngineValidator(require);
            expect(validator.isValidAppInterface("IPreMessageSentPrevent")).to
                .be.true;
        });

        it("returns false for an unknown interface", () => {
            const require = makeRequire({
                [OLD_INTERFACE_PATH]: { AppInterface: mockAppInterface },
            });
            const validator = new AppsEngineValidator(require);
            expect(validator.isValidAppInterface("IDoesNotExist")).to.be.false;
        });

        it("falls back to the legacy module path when primary path is not found", () => {
            const require = makeRequire({
                [NEW_INTERFACE_PATH]: { AppInterface: mockAppInterface },
            });
            const validator = new AppsEngineValidator(require);
            expect(validator.isValidAppInterface("IPostMessageSent")).to.be
                .true;
        });

        it("returns false for falsy interface value (not just key presence)", () => {
            const require = makeRequire({
                [OLD_INTERFACE_PATH]: {
                    AppInterface: { IFalsyInterface: "" },
                },
            });
            const validator = new AppsEngineValidator(require);
            expect(validator.isValidAppInterface("IFalsyInterface")).to.be
                .false;
        });
    });
});
