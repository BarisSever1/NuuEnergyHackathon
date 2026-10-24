import json, pathlib, re
root = pathlib.Path(__file__).parent
data = json.load(open(root/'data/buildings_dev.json')) + json.load(open(root/'data/buildings_eval.json'))
html = (root/'src/app.html').read_text()
html = html.replace('/*__DATA__*/', 'window.HP_DATA = ' + json.dumps(data, ensure_ascii=False) + ';')
html = html.replace('/*__ENGINE__*/', (root/'src/engine.js').read_text())
(root/'index.html').write_text(html)
# shared-link version: the host adds doctype/head/body itself
art = html
for tag in ['<!doctype html>\n', '<html lang="en">\n', '<head>\n', '<meta charset="utf-8">\n',
            '<meta name="viewport" content="width=device-width, initial-scale=1">\n', '</head>\n', '<body>\n', '</body>\n', '</html>\n']:
    assert tag in art, tag
    art = art.replace(tag, '', 1)
(root/'dist').mkdir(exist_ok=True)
(root/'dist/heat-pump-ready.html').write_text(art)
print('built', len(html), len(art))
