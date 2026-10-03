export interface PathItem {
  path_type: "Dir" | "SymlinkDir" | "File" | "SymlinkFile";
  name: string;
  mtime: number;
  size: number;
  is_dir: boolean;
  is_symlink: boolean;
  ext: string;
  fullpath: string;
  filename: string;
}

export interface DufsData {
  allow_archive: boolean;
  allow_delete: boolean;
  allow_search: boolean;
  allow_upload: boolean;
  auth: boolean;
  dir_exists: boolean;
  href: string;
  kind: "Index" | "Edit";
  paths: PathItem[];
  uri_prefix: string;
  user: string | null;
}
