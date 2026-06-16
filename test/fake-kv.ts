type StoredValue = {
	value: string;
	expiresAt?: number;
};

export class FakeKV {
	private values = new Map<string, StoredValue>();

	async get(key: string, type?: "text" | "json") {
		const item = this.values.get(key);
		if (!item) {
			return null;
		}
		if (item.expiresAt && item.expiresAt <= Date.now()) {
			this.values.delete(key);
			return null;
		}
		if (type === "json") {
			return JSON.parse(item.value);
		}
		return item.value;
	}

	async put(
		key: string,
		value: string,
		options?: { expirationTtl?: number },
	): Promise<void> {
		this.values.set(key, {
			value,
			expiresAt: options?.expirationTtl
				? Date.now() + options.expirationTtl * 1000
				: undefined,
		});
	}

	async delete(key: string): Promise<void> {
		this.values.delete(key);
	}

	async list(options?: { prefix?: string }) {
		const prefix = options?.prefix ?? "";
		return {
			keys: [...this.values.keys()]
				.filter((name) => name.startsWith(prefix))
				.map((name) => ({ name })),
			list_complete: true,
			cacheStatus: null,
		};
	}

	asNamespace(): KVNamespace {
		return this as unknown as KVNamespace;
	}
}
