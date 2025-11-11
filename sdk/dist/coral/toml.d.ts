export type CoralAgentOption = {
    type: 'string' | 'number';
    description: string;
    default?: string | number;
    required?: boolean;
};
export type CoralAgentMetadata = {
    name: string;
    version: string;
    description: string;
};
export declare function buildCoralAgentToml(meta: CoralAgentMetadata, options?: Record<string, CoralAgentOption>, runtime?: 'docker' | 'executable'): string;
//# sourceMappingURL=toml.d.ts.map