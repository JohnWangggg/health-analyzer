/**
 * Pick export.xml / 导出.xml from a folder FileList (webkitdirectory).
 */

export type FolderPickResult =
  | { kind: 'xml'; file: File; label: string }
  | { kind: 'zip'; file: File; label: string }
  | { kind: 'none'; reason: string };

function basename(path: string): string {
  const s = path.replace(/\\/g, '/');
  const i = s.lastIndexOf('/');
  return i >= 0 ? s.slice(i + 1) : s;
}

/**
 * Prefer root-ish export.xml / 导出.xml; else any .xml named export; else first .zip.
 */
export function pickHealthExportFromFolder(files: File[]): FolderPickResult {
  if (!files.length) return { kind: 'none', reason: 'empty_folder' };

  const xmlPrefer = files.filter((f) => {
    const n = basename(f.name || f.webkitRelativePath || '');
    return /^(export|导出)\.xml$/i.test(n);
  });
  if (xmlPrefer.length) {
    const file = xmlPrefer[0]!;
    return {
      kind: 'xml',
      file,
      label: file.webkitRelativePath || file.name,
    };
  }

  const anyXml = files.filter((f) =>
    /\.xml$/i.test(basename(f.name || f.webkitRelativePath || '')),
  );
  if (anyXml.length) {
    // Prefer path with fewest segments (closer to root)
    anyXml.sort(
      (a, b) =>
        (a.webkitRelativePath || a.name).split(/[/\\]/).length -
        (b.webkitRelativePath || b.name).split(/[/\\]/).length,
    );
    const file = anyXml[0]!;
    return {
      kind: 'xml',
      file,
      label: file.webkitRelativePath || file.name,
    };
  }

  const zips = files.filter((f) =>
    /\.zip$/i.test(basename(f.name || f.webkitRelativePath || '')),
  );
  if (zips.length) {
    const file = zips[0]!;
    return {
      kind: 'zip',
      file,
      label: file.webkitRelativePath || file.name,
    };
  }

  return { kind: 'none', reason: 'no_export_xml_or_zip' };
}
