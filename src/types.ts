export interface ConfigData {
  nas: { destination_path: string };
  sync: {
    sync_path: string;
    sync_cache_data: boolean;
    exclude: string[];
    categories: string[];
  };
  state: {
    lastUpload?: string;
    lastDownload?: string;
    lastSync?: string;
    machineId?: string;
  };
}

export interface SyncMetadata {
  backupId: string;
  machineId: string;
  machineName: string;
  platform: string;
  timestamp: string;
  syncType: "upload" | "download" | "sync";
  categories: string[];
  fileCount: number;
}


