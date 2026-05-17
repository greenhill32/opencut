import type { TProject } from "./types";
import type { MediaAsset } from "@/media/types";
import { generateUUID } from "@/utils/id";
import { CURRENT_PROJECT_VERSION } from "@/services/storage/migrations";

export const OPENPROJ_MIME = "application/x-openproj+json";
export const OPENPROJ_EXT = ".openproj";

export interface EmbeddedMedia {
	id: string;
	name: string;
	type: string;
	mimeType: string;
	data: string; // base64
	width?: number;
	height?: number;
	duration?: number;
	thumbnailUrl?: string;
}

interface OpenprojFile {
	type: "opencut-template";
	version: number;
	exportedAt: string;
	project: unknown;
	media: EmbeddedMedia[];
}

async function fileToBase64(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve((reader.result as string).split(",")[1]);
		reader.onerror = reject;
		reader.readAsDataURL(file);
	});
}

export function base64ToFile(data: string, name: string, mimeType: string): File {
	const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
	return new File([bytes], name, { type: mimeType });
}

export async function serializeTemplate(
	project: TProject,
	mediaAssets: MediaAsset[],
): Promise<string> {
	const embeddedMedia: EmbeddedMedia[] = await Promise.all(
		mediaAssets.map(async (asset) => ({
			id: asset.id,
			name: asset.name,
			type: asset.type,
			mimeType: asset.file.type || "application/octet-stream",
			data: await fileToBase64(asset.file),
			width: asset.width,
			height: asset.height,
			duration: asset.duration,
			thumbnailUrl: asset.thumbnailUrl,
		})),
	);

	const serialized = {
		...project,
		metadata: {
			...project.metadata,
			createdAt: project.metadata.createdAt.toISOString(),
			updatedAt: project.metadata.updatedAt.toISOString(),
		},
		scenes: project.scenes.map((scene) => ({
			...scene,
			createdAt: scene.createdAt.toISOString(),
			updatedAt: scene.updatedAt.toISOString(),
		})),
	};

	const file: OpenprojFile = {
		type: "opencut-template",
		version: CURRENT_PROJECT_VERSION,
		exportedAt: new Date().toISOString(),
		project: serialized,
		media: embeddedMedia,
	};

	return JSON.stringify(file, null, 2);
}

export function deserializeTemplate(json: string): {
	project: TProject;
	media: EmbeddedMedia[];
} {
	let parsed: unknown;
	try {
		parsed = JSON.parse(json);
	} catch {
		throw new Error("Invalid .openproj file — could not parse JSON");
	}

	const file = parsed as Partial<OpenprojFile>;
	if (file.type !== "opencut-template" || !file.project) {
		throw new Error("Invalid .openproj file — missing required fields");
	}

	const raw = file.project as Record<string, unknown>;
	const rawMeta = raw.metadata as Record<string, unknown>;
	const now = new Date();

	const project: TProject = {
		...(raw as unknown as TProject),
		metadata: {
			...(rawMeta as unknown as TProject["metadata"]),
			id: generateUUID(),
			createdAt: now,
			updatedAt: now,
		},
		scenes: (raw.scenes as Array<Record<string, unknown>>).map((scene) => ({
			...(scene as unknown as TProject["scenes"][number]),
			createdAt: new Date(scene.createdAt as string),
			updatedAt: new Date(scene.updatedAt as string),
		})),
		version: CURRENT_PROJECT_VERSION,
	};

	return { project, media: file.media ?? [] };
}
