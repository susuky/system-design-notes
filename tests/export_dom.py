#!/usr/bin/env python3
"""Serialize a local HTML document for the lightweight DOM logic test harness."""
import json,sys
from html.parser import HTMLParser
from pathlib import Path
VOID={'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'}
class Tree(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True);self.root={'tag':'document','attrs':{},'children':[]};self.stack=[self.root]
    def handle_starttag(self,tag,attrs):
        node={'tag':tag,'attrs':dict(attrs),'children':[]};self.stack[-1]['children'].append(node)
        if tag not in VOID:self.stack.append(node)
    def handle_startendtag(self,tag,attrs):
        self.stack[-1]['children'].append({'tag':tag,'attrs':dict(attrs),'children':[]})
    def handle_endtag(self,tag):
        for i in range(len(self.stack)-1,0,-1):
            if self.stack[i]['tag']==tag:self.stack=self.stack[:i];break
    def handle_data(self,data):
        self.stack[-1]['children'].append(data)
tree=Tree();tree.feed(Path(sys.argv[1]).read_text(encoding='utf-8'));print(json.dumps(tree.root,ensure_ascii=False))
