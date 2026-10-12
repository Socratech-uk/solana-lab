"""Import the verified cApp asset-payment dependency overlay, without editing cApp."""
from pathlib import Path
import argparse, hashlib, json, zipfile

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('archive', type=Path)
parser.add_argument('--sha256', required=True, help='Expected SHA-256 supplied with the cApp overlay')
args = parser.parse_args()
sha = lambda data: hashlib.sha256(data).hexdigest()
archive_bytes = args.archive.read_bytes()
if sha(archive_bytes) != args.sha256:
    raise SystemExit('Dependency archive digest mismatch; no files changed')
with zipfile.ZipFile(args.archive) as z:
    manifest = json.loads(z.read('capp-overlay-manifest.json'))
    if manifest.get('phase') != 'asset-payments-foreground-reads':
        raise SystemExit('Expected the cApp asset-payment capability overlay')
    entries = {row['path']: row for row in manifest['files']}
    def read(name):
        data = z.read(name)
        if len(data) != entries[name]['bytes'] or sha(data) != entries[name]['sha256']:
            raise SystemExit('Dependency file digest mismatch: ' + name)
        return data
    ledger = json.loads((ROOT/'runtime/sources.json').read_text())
    writes = {}
    for component in ['compass','conduit','edge','sentinel','latch','witness']:
        package = 'sidecars/solana-' + component
        meta = json.loads(read(package+'/sidecar.json'))
        source = package+'/'+meta['compile']['shellEntry']
        data = read(source)
        row = next(row for row in ledger['components'] if row['component'] == component)
        row.update(version=meta['version'], source=source, sha256=sha(data))
        writes[row['file']] = data
    shared = [
        ('src/js/18-solana-architecture.generated.js','src/architecture.js'),
        ('sidecars/runtime/solana-client.mjs','src/solana-client.mjs'),
        ('sidecars/runtime/solana-client.d.mts','src/solana-client.d.mts'),
        ('sidecars/runtime/solana-payments.mjs','src/solana-payments.mjs'),
        ('sidecars/runtime/solana-payments.d.mts','src/solana-payments.d.mts'),
        ('docs/features/SOLANA_DEVELOPER_GUIDE.md','assets/SOLANA_DEVELOPER_GUIDE.md'),
        ('docs/features/SOLANA_ASSET_PAYMENTS.md','assets/SOLANA_ASSET_PAYMENTS.md'),
    ]
    developer = json.loads((ROOT/'runtime/developer-assets.json').read_text())
    for source, file in shared:
        data = read(source)
        writes[file] = data
        developer['files'] = [r for r in developer['files'] if r['file'] != file]
        developer['files'].append({'source':source,'file':file,'sha256':sha(data)})
    provenance = {'archive':args.archive.name,'sha256':args.sha256,'phase':manifest['phase']}
    ledger['capabilityDependency'] = provenance
    developer['capabilityDependency'] = provenance
    writes['runtime/sources.json'] = (json.dumps(ledger,indent=2)+'\n').encode()
    writes['runtime/developer-assets.json'] = (json.dumps(developer,indent=2)+'\n').encode()
    # All selected bytes validate before any replacement is made.
    for name, data in writes.items():
        (ROOT/name).write_bytes(data)
print('Updated six Sidecars and shared asset/payment SDK; existing app source is unchanged')
