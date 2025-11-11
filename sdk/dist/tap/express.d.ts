import { TapAlg } from './sign.js';
export type TapRouterOptions = {
    basePath?: string;
    keyId: string;
    alg: TapAlg;
    ed25519PublicKeyB64?: string;
    ed25519PrivateSeedB64?: string;
    rsaPublicKeyPem?: string;
    rsaPrivateKeyPem?: string;
};
export declare function registerTapRoutes(app: any, opts: TapRouterOptions): void;
//# sourceMappingURL=express.d.ts.map