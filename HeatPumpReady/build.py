import json, pathlib
root = pathlib.Path(__file__).parent
data = json.load(open(root/'data/buildings_dev.json')) + json.load(open(root/'data/buildings_eval.json'))
html = (root/'src/app.html').read_text()
html = html.replace('/*__DATA__*/', 'window.HP_DATA = ' + json.dumps(data, ensure_ascii=False) + ';')
html = html.replace('/*__ENGINE__*/', (root/'src/engine.js').read_text())
(root/'index.html').write_text(html)
print('built', len(html), 'bytes')
