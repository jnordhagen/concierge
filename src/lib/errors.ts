export class UpstreamApiError extends Error {
	status: number;
	data: unknown;

	constructor(message: string, status: number, data: unknown) {
		super(message);
		this.name = "UpstreamApiError";
		this.status = status;
		this.data = data;
	}
}

export function textContent(text: string) {
	return {
		content: [{ type: "text" as const, text }],
	};
}

export function jsonContent(summary: string, value: unknown) {
	return {
		content: [
			{ type: "text" as const, text: summary },
			{ type: "text" as const, text: JSON.stringify(value, null, 2) },
		],
	};
}

export function handleToolError(error: unknown) {
	if (error instanceof UpstreamApiError) {
		return jsonContent(`Upstream API error: ${error.status} ${error.message}`, {
			status: error.status,
			data: error.data,
		});
	}

	if (error instanceof Error) {
		return textContent(`Error: ${error.message}`);
	}

	return textContent("Error: Unknown failure");
}
