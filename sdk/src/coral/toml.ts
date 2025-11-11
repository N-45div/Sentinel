export type CoralAgentOption = {
  type: 'string' | 'number';
  description: string;
  default?: string | number;
  required?: boolean;
};

export type CoralAgentMetadata = {
  name: string;
  version: string; // semver
  description: string;
};

export function buildCoralAgentToml(meta: CoralAgentMetadata, options: Record<string, CoralAgentOption> = {}, runtime: 'docker' | 'executable' = 'executable'): string {
  const lines: string[] = [];
  lines.push('[agent]');
  lines.push(`name = "${meta.name}"`);
  lines.push(`version = "${meta.version}"`);
  lines.push(`description = "${meta.description.replace(/"/g, '\"')}"`);
  if (Object.keys(options).length > 0) {
    lines.push('');
    lines.push('[options]');
    for (const [key, opt] of Object.entries(options)) {
      const optLines: string[] = [];
      optLines.push(`[options.${key}]`);
      optLines.push(`type = "${opt.type}"`);
      optLines.push(`description = "${opt.description.replace(/"/g, '\"')}"`);
      if (opt.default !== undefined) optLines.push(`default = ${typeof opt.default === 'number' ? opt.default : '"' + String(opt.default).replace(/"/g, '\"') + '"'}`);
      if (opt.required !== undefined) optLines.push(`required = ${opt.required ? 'true' : 'false'}`);
      lines.push(...optLines);
    }
  }
  lines.push('');
  lines.push('[runtime]');
  lines.push(`type = "${runtime}"`);
  return lines.join('\n') + '\n';
}
