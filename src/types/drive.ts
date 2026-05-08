export interface Drive {
	id: string;
	name: string;
	bsdName: string;
	mountPoint: string;
	totalSpace: number; // bytes
	freeSpace: number; // bytes
}
