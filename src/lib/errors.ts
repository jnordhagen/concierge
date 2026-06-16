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
