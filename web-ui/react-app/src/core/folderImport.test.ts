import { describe, expect, it } from 'vitest';
import { pickHealthExportFromFolder } from './folderImport';

function fakeFile(name: string, rel?: string): File {
  const f = new File(['<xml/>'], name, { type: 'text/xml' });
  if (rel) {
    Object.defineProperty(f, 'webkitRelativePath', {
      value: rel,
      configurable: true,
    });
  }
  return f;
}

describe('pickHealthExportFromFolder', () => {
  it('prefers export.xml by basename', () => {
    const files = [
      fakeFile('other.xml', 'apple_health_export/other.xml'),
      fakeFile('export.xml', 'apple_health_export/export.xml'),
    ];
    const r = pickHealthExportFromFolder(files);
    expect(r.kind).toBe('xml');
    if (r.kind === 'xml') expect(r.file.name).toBe('export.xml');
  });

  it('accepts 导出.xml', () => {
    const r = pickHealthExportFromFolder([
      fakeFile('导出.xml', 'dir/导出.xml'),
    ]);
    expect(r.kind).toBe('xml');
  });

  it('falls back to zip', () => {
    const f = new File(['x'], 'export.zip', { type: 'application/zip' });
    const r = pickHealthExportFromFolder([f]);
    expect(r.kind).toBe('zip');
  });

  it('empty → none', () => {
    expect(pickHealthExportFromFolder([]).kind).toBe('none');
  });
});
