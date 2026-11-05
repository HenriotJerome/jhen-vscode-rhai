interface DocSection {
	title: string;
	lines: string[];
}

function splitSections(docs: string[]): { description: string[]; sections: DocSection[] } {
	const description: string[] = [];
	const sections: DocSection[] = [];
	let current: DocSection | undefined;

	for (const raw of docs) {
		const text = raw.trim();
		const heading = text.match(/^#+\s*(.+)$/);
		if (heading) {
			current = { title: heading[1].trim(), lines: [] };
			sections.push(current);
			continue;
		}
		if (current) {
			current.lines.push(raw);
		} else {
			description.push(raw);
		}
	}

	return { description, sections };
}

function cleanLines(lines: string[]): string[] {
	const cleaned = lines.map((line) => line.trimEnd());
	while (cleaned.length > 0 && cleaned[0].trim() === '') {
		cleaned.shift();
	}
	while (cleaned.length > 0 && cleaned[cleaned.length - 1].trim() === '') {
		cleaned.pop();
	}
	return cleaned;
}

function parseParams(lines: string[]): { name: string; description: string }[] {
	const params: { name: string; description: string }[] = [];

	for (const raw of lines) {
		const text = raw.trim();
		const named = text.match(/^[*-]\s+`?([^`]+?)`?\s*[-:]\s*(.+)$/);
		if (named) {
			params.push({ name: named[1].trim(), description: named[2].trim() });
			continue;
		}
		const plain = text.match(/^[*-]\s+(.+)$/);
		if (plain) {
			params.push({ name: '', description: plain[1].trim() });
		}
	}

	return params;
}

function renderSection(section: DocSection): string {
	const raw = cleanLines(section.lines);
	const tags = raw.filter((line) => /^@[A-Za-z]+/.test(line.trim())).map((line) => `*${line.trim()}*`);
	const body = raw.filter((line) => !/^@[A-Za-z]+/.test(line.trim()));
	const suffix = tags.length > 0 ? `\n\n${tags.join('  \n')}` : '';

	if (/arguments?|param/i.test(section.title)) {
		const params = parseParams(body);
		if (params.length > 0) {
			const rows = params.map(
				(param) => `| ${param.name ? `\`${param.name}\`` : '—'} | ${param.description} |`
			);
			return [`**${section.title}**`, '', '| Paramètre | Description |', '| --- | --- |', ...rows].join('\n') + suffix;
		}
	}

	if (/returns?|retour/i.test(section.title)) {
		const text = body.join(' ').trim();
		return (text ? `**${section.title}** : ${text}` : `**${section.title}**`) + suffix;
	}

	const content = body.join('\n').trim();
	return (content ? `**${section.title}**\n\n${content}` : `**${section.title}**`) + suffix;
}

export function renderDocumentation(docs: string[]): string {
	const { description, sections } = splitSections(docs);
	const parts: string[] = [];

	const intro = cleanLines(description).join('\n').trim();
	if (intro.length > 0) {
		parts.push(intro);
	}

	for (const section of sections) {
		parts.push(renderSection(section));
	}

	return parts.join('\n\n').trim();
}
