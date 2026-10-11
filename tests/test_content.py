#!/usr/bin/env python3
"""Regression tests for the retained textbook and its original visual models.

Run: python tests/test_content.py [--html path/to/system-design.html]
The baseline fingerprints were recorded from the original 16 authored chapters
before the bounded prose edit. They intentionally protect structure, numeric
facts, terms, quotations, code, links, and SVGs rather than freeze all prose.
Only Python and Node are needed. The JS checks use a small simulated DOM; they
are not a browser-layout or assistive-technology audit.
"""
from __future__ import annotations
import argparse
from collections import Counter
import hashlib
import html
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]
ARGS = None
BASELINE = {
  "01": {
    "structure": "da6cce68d31cc67003bd6d3fff718437b3e2f9756b7d3834cf9c61dfb4809d02",
    "svg": "ed710d59c936bfbcc0b15cdc2d5a30fc57dcc039f4c4f2f8e10124667d08c94c",
    "code": "e47a85cfa2923502a38e836b4de23f33adfdd50a5e452e13d31508e1612b83a7",
    "links": "c931e9fa1445fd10cec3ac3a0ec7349072f2e106b64da23845cd23036af6a516",
    "ids": "a546116fc0e59ef010f6328df6dde752b0ca0134968b7c18fd47c68333025fbe",
    "numbers": "8fe28a59a2a64f2f513c56bb43258040c4ad4862d2501d8f4972e6c2a12b240d",
    "latin_terms": "d3eab06bb1fb90488661adf817a0655ea1bb3d6dfbbb5400fdead28741b61bd9",
    "quotations": "77e11ecab1ba861b602210778ff4467b3e41c7233837f31da876709abea7f005",
    "headings": "92c7ee90394a841b4f91a8039b1f3f19ba360b866b13cec7e072099f029cb543",
    "paragraphs": 24,
    "figures": 2,
    "details": 3
  },
  "02": {
    "structure": "e3b0bec262fbd8f9b90921a136a1fec2d0f9a0cfc1cdda663a87bdb0e372dfae",
    "svg": "0d797ac4e80d48fcce07fd6e98a4ee8fca1a8410cbaed9c99e5bf9661921e8f8",
    "code": "85913ba80f5e93906d8fdcf23e3d0b36cc46f6993cbe3f8f7e5cdfd07a4aeae5",
    "links": "2b9ee0f801397e6507a4c7de170626f92cc273a981c55eb4da9c4a47238f0b3e",
    "ids": "1f5a5560d8d5080e38dcbc56cc148757e39fd6ab020bfb38419cb3efe83a94c5",
    "numbers": "e82ea6ce626b9d0b05a1a075dca6a7b802a50e50aef693861ff68eb27d470207",
    "latin_terms": "282c60349f62467a14f4701727d721c69034775ef1b0171e73b8a16a819f2e45",
    "quotations": "37492f58e00fdfdb5e969fb142e68f761cab3e968e3fbda3ca4e5d5c2cd4e845",
    "headings": "53f9418f6943d4653b1b9c134567730aec97c6c41cf90df11844434e15574af9",
    "paragraphs": 86,
    "figures": 7,
    "details": 10
  },
  "03": {
    "structure": "f51699a6751bb7f72b2a526de630d11edc62c618d613b5bc3d6c110f42f9c92c",
    "svg": "2ccb40065a49ef41b38910ca4e99f7b99ae1af7a7c52d9035b25b99bb2c0404c",
    "code": "17e758f02a3e403d0291f351072546eeda5acefcf83807f80af93928b1ecd409",
    "links": "e0d87a6b0e7f4b4436b25fed649845c530aa5627a3aa99b64e55b6ace299d20c",
    "ids": "b9752acb32d2d11b076fac3c2c44661a9f118eaa0ee6aacbc5d99f48554ee5ee",
    "numbers": "7645d4629663e916f8cc00eb3b92f4a937eeb2fd25fc300fa8fdb8aa1d6a4fc1",
    "latin_terms": "6b97b5727778bc82747303f9ffc2b6c350e72a06547d3cc59420a11d26198624",
    "quotations": "b940bbd4b2f77c69c7d9e85fdf3e566e859c296ab23e68bc15719a18db8f266f",
    "headings": "c6133ce82b24e690aed1fc7b4f7d3f85e1f7c6105d3ba80ccc7c581244d8d238",
    "paragraphs": 50,
    "figures": 2,
    "details": 6
  },
  "04": {
    "structure": "ac99fd687a3eda664179d270967977f2671ba3bfd1b1c4e54eca76a4b44f9bf7",
    "svg": "26936b7566e61bbc22727f212fd9e255567f3f0a0a5c0ca237f9375c2e91c371",
    "code": "0a9b3ff8dbdb7e8b51f5e86429509f1679fffca9161fc6b231251b720d6f0d81",
    "links": "0c90f16171680c1780c2cf2de5ab1250dce9feb382d798b89c4f0f9d92958967",
    "ids": "724fdb9cf8903986bf27844d6d0339bcc0a005c3cd917ded8bd3ed042a4395a8",
    "numbers": "873ccafeebf1975426f470e9bffe0941d78d5c390ea8954ddf96c3180b372364",
    "latin_terms": "b5c861a4e37c0474dccf82548dd0c5768ce32d427f45152bfcf864e3fa80ca4a",
    "quotations": "1a3a0c65b12a6c867ac48894f59fe45230895c2866d8618b6306579577513ac1",
    "headings": "4c6d8888d8a03ed9b91f2d8a1bd292d2711a5e90552afcf7810d0c1ebda4a788",
    "paragraphs": 45,
    "figures": 3,
    "details": 6
  },
  "05": {
    "structure": "fba88f952bb87329ab25131b3dc58062f46878dcfe2f6255d454387c9e55f945",
    "svg": "9b1af665fb58f5e9033edc3ae886ec281102522533dc9e07b1f6d9587e4476d1",
    "code": "e2122b7f3571c9e7d966ac0207282804f93ab9785e2065ea1ba8121e4adb60ed",
    "links": "b0db7db0ae325331a31d6da2cecf881ae77276c436c28ce3be1e0b34bac68a38",
    "ids": "ec02d2647cb86e2479394ad7044cd439f70a29b148a42e2cf33723006089f1bc",
    "numbers": "79fef15a27efeab425c65f1210fbc6cb151353e1d4fd82ecde84c940e4607f18",
    "latin_terms": "e0a12d07cd90bf17d288e221ddc10f205a2d988531b3846a244ae803c4fd5f8a",
    "quotations": "15fe7cf9ea384bb717aa9aea8d52f2e6e2a2c4cfec56e125f86fb98b8d205e79",
    "headings": "1a4424d76d9f41bdd3c78c49d140a3bb0add1a68f0653f6336a38661c8953e12",
    "paragraphs": 28,
    "figures": 8,
    "details": 2
  },
  "06": {
    "structure": "a214deab67b9ca9e7671c317994fef0f1d4adf3e5fb5a84c6c51c076b7afa8a3",
    "svg": "76bbbbf1c65d28cd1c5bb9b8f80ff2938388fe811f44c77541fd144e83c8d1ce",
    "code": "c2cb4c42497fc02d364bfb7001348fcc97d4e9fb9c0d374486a42b3654c32f2b",
    "links": "ebab8ae416789cf3a1ec196575cd2ac85bfb2b2191512ed86bff478d702b766b",
    "ids": "1df8d94789c8aaf2cd49dd4f4004c0f6cdda93d8c8fe1322327f6639dca406f2",
    "numbers": "450966e7134c80a51f38e3651ec27abd79615e4a651eda3ee05eb6155a955d56",
    "latin_terms": "767a4ddb7fc0428333cf085bb15509ec4285c30927c51eea8bbe02b10f2f53eb",
    "quotations": "4cef1519633249580b41bdf5dfc729aa17d2bd11a44559292d5332b89059b7e8",
    "headings": "419fb53a254bb9e40ecf392eca2eea9f99eff9dde5357bf0c5246f12b91db0e8",
    "paragraphs": 50,
    "figures": 4,
    "details": 7
  },
  "07": {
    "structure": "61f2cdfd098658f09c9c46b23ec71b29dadd6485e25fa37aa8f6053536d617bc",
    "svg": "fbc32a11a10bde1f1e31aab35dbc3832ba4a7c63ec93fd61441c36954aba0e75",
    "code": "e94ee236adcca04158381d406f5b4aa0c223a7a28ee20233553c80719700ca09",
    "links": "35b593650a480158203f1f6252521f378d48bbc4b8b94d93ab0719d6d324c11d",
    "ids": "7b1e73b0b82a53c17eefd55311e2f41cc7853eba3556e81c9dba05258f8fcb58",
    "numbers": "6b0c86e8d4a3a8d2d6fbbb2b6920c383a9ffabf3d39cffe590f9057d8fa11e6d",
    "latin_terms": "62771a1070f8ddb155585426b5b0d388d4dbcae9edc2db64e59b2a17335b585d",
    "quotations": "c1aef884ded545993baa10d6caef198b827a135cc3590c7e1ba36df73abe8d52",
    "headings": "cc29834398809f5c5aec7e3b065a48f32de18787ff251d0378c9eba0b7f87d1f",
    "paragraphs": 73,
    "figures": 8,
    "details": 10
  },
  "08": {
    "structure": "b53c7f71084e734283139e35498105b59098cea01aab15475a3b43117a9b1344",
    "svg": "331b20d712230139928218b524d0ad4493af32c40520dc01287adf6c3a7d7cc8",
    "code": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "links": "c0e250eb6e571fd0673a9ad3789b5bda4ac3b30a1c408e5668369f738ea18499",
    "ids": "0d4ae9ddb82067a07bfe4f7fe083d976e0cf43631059cae41d5add61f256d180",
    "numbers": "68040ea6acf2e7bbc99d02defcdbbabe59ef7ed0377a315e0f264279b5c7f5a5",
    "latin_terms": "8cd21c9c29e4460fcfcc06a08a419af983a7e4b41a076598fb18f44ce715187c",
    "quotations": "2f13419bbd73d5de85c7e498b49dffc6a6ff2c2c1de52c295010d8f92d4bbe28",
    "headings": "ae85b3071281e4e0b06588044ba1dad276d81661bc8ff0755baa2b559ed47211",
    "paragraphs": 78,
    "figures": 4,
    "details": 12
  },
  "09": {
    "structure": "9b78fc21b6be85cdde0aaa4173b9eaa4d97ce90caf8e4c862f43459a72d6ccf1",
    "svg": "d12428a9ae522573a3f426b1507fdecc47b10b54e2950b871f17c86278c6953c",
    "code": "1999036786b5044cb2e91f88722c308cee1e09b8a1e478f3e79743e3daf4a924",
    "links": "833049d2ece6105e1d45ace96efb8b3cf9ac18b9f840c1260d9b181bb123bcb3",
    "ids": "f0cb9dcc3c344b3f7798ea8507839054089b6a84b4436f88c04c4e00e556667f",
    "numbers": "87f8aa5acd6a2848c1ef3479c74cb7a667f332af94d4affbe3d9b2663fb11adf",
    "latin_terms": "a27df73d0452a4d191d29e8f1add786f21a2dceac930b6596f36c5c1143bba4f",
    "quotations": "6e8fa474f88100ff77e4bd752c39dd16d5e846bf57b26170e82e40fb34b9a1f0",
    "headings": "df4f59e3f8f7097f5ec169beafdef5163c58725d04d0c98b6053319ef242f256",
    "paragraphs": 52,
    "figures": 9,
    "details": 7
  },
  "10": {
    "structure": "6e3553f87a1887802c3efbe7a56a8e36b80820f5ab47f3ae7ab87323a1f98d90",
    "svg": "01a677a962450d5062a3d3984c6bd7860a8f704f1139879ba44b674a517625a6",
    "code": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "links": "f3f34dfcacf41239c16674b68c135d96d05100dd33a8aa077bfb2f7ea40e9395",
    "ids": "5a5b0a87901799dcad37437196f531dc2397a44f6c41081017f3ae872bafa99f",
    "numbers": "c7e845cc71b2f6beb177b2d356ab216ebe1645dafc4cd6866a4b10be6f7220b2",
    "latin_terms": "719ca73511e48152b55d833d9bddcaafee472d6ca091b4415d1682bd81929c56",
    "quotations": "0a34d0e07471a956c2100116cd291e28167ce3d8c1fa1a3b66c18fc1c57c83ae",
    "headings": "dfa494903e9d53819ddebb93c0c4e6e92d2d6dac64d061c1e800cfaade2c01f4",
    "paragraphs": 23,
    "figures": 2,
    "details": 2
  },
  "11": {
    "structure": "65af0914e5419ba052c637d7483c6862d7d35c41bbad4a0b7a2900e1da823180",
    "svg": "b1629a70320ba28e33ae56dd86ea1fa9a9196884dd2f4ce481c69a7185c7c755",
    "code": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "links": "196d31579815033db6b344ae7d1898a45c79591cb1da209e13a83fb03e76acf4",
    "ids": "69273976cd66e9cb96f9356fe7eea6406914d61265c28c09a300946ce2b0c272",
    "numbers": "8fc9b5d71252e89665a055d809b2976e65e28aa83513c8efea331d6b678db1ce",
    "latin_terms": "75b5954e3493cc8da4d50ec4b8b845866e1548c6dcc14e8f9324f4785ebe9888",
    "quotations": "8eef92f6be868ee7ec605f150b6e56ab9444e6856126729e26fd63513946d200",
    "headings": "1807944a178ff726f4da8a8d324ff1ef7cbc6f44cbd1e1b38934c1b043016a49",
    "paragraphs": 53,
    "figures": 4,
    "details": 8
  },
  "12": {
    "structure": "95a8c4ca8a473e53626cdf3b3cf99396ec712a6e96c81203f45053785f02c1e6",
    "svg": "feba95b1b5c0fa4f9d0255b55cce287bec516d2b44f2c7d307af943c2f2c9e7e",
    "code": "c53555e8ae5f48b4d8e41aec739b6c676ca58825ab20a40e31796a419e36ccbd",
    "links": "dfefdc5ee23d04b1ef0439ab5309cb41c3079982cb6493ad3510730299b7e069",
    "ids": "800a4170d16a58ff19c5ac9964795ddf8b49e99b8a09802342884254b5ff46e5",
    "numbers": "ddcdd4f849301505119e41b6c847c216a807f97d2ec6210d49a9daa1ef5e9df9",
    "latin_terms": "432c55605e6e78f2f6b1f19abb40a693b2f8460a1336fb76dd16ab9d13d08d6e",
    "quotations": "8f7addfddfc4eb47ba27de9ef55dc6328ceebc18fc640091e16f364d8e2f24fa",
    "headings": "c5c3c39a451f21015b43f02df4e25c2a2c318b4176b6a5ac8504a48b7949c94e",
    "paragraphs": 38,
    "figures": 8,
    "details": 4
  },
  "13": {
    "structure": "d172746d9eb8901f2db483541909aa2a367e24d74d99c8a078928f223341e945",
    "svg": "8ac73fd5c9ead855e6e46628434ec80620b75ac997b37c08e4979e486a1487d3",
    "code": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "links": "fe04966e5b63c48587e96a959eb9d10c78bc086bafee9102d39eb67e52e94389",
    "ids": "961ac6be845e00ce8d59150e56a67ed882129495d93abebb63e40ee9c0e2c8c3",
    "numbers": "70e03103de342e7cb8edf29ce89f0de819d51eec6c94545780130e2a0a1503a1",
    "latin_terms": "89ff20d496b92b34f54ade5b6685faad979906e79b1e44d1a753a776f4a2d603",
    "quotations": "a640fd3daa155de8f98fa27fb2eb44b9bf0925213a4cb334e3acb65779a59ccf",
    "headings": "d7a518ea75d41bd8b0121e00e8127f3a4da6294f276634687b67b829800b05ba",
    "paragraphs": 38,
    "figures": 9,
    "details": 5
  },
  "14": {
    "structure": "0af45d1b2de4b058ce2e6abca30a53f180310c9b81b74fc10621ca600bae2fd9",
    "svg": "d7bbaeb605b08e1cf4fb086c449575bcac225d04330f89f4eb3422e1a6846064",
    "code": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "links": "fda2b602a629a571e82789da1dd73dac93c1af230d94a08ecece8191ac56d657",
    "ids": "75af9636a5caef7d32f3d120d12f8e1817c7c9c51e3782ed95befb662eea45b5",
    "numbers": "fd3b7340eb787a6fd80a9deb25d0c18dc87c477dfbcfcee5a120b6d82f0fb1de",
    "latin_terms": "33e717a1f41931de7da99da4e319293c39ddd25c3307a57d7dc2ca6eecd07fbc",
    "quotations": "1edf12c318144084baeebbe8a6d63dce8b9141e54086bae85f1c83f86c722153",
    "headings": "9886cbf4529f79f0913db062405740795fe6e37e2e5222a28f75b4d15d287ef3",
    "paragraphs": 11,
    "figures": 1,
    "details": 2
  },
  "15": {
    "structure": "747cb0316552e67a00aec37111bd0460728ad6a078303b7395cd30d3aa72092f",
    "svg": "1510cafff57f7594487d8e5a0564675983398c9d0f85355eaeb3830522a5d2f4",
    "code": "fb64d8c48388698353d4324f1a88c281ca56e4557076bef74819dc0ae292c356",
    "links": "3b660c77c67c55bfe6dcab010d1c3c475894a47f95b77c26567cccd7c9d3cd9a",
    "ids": "a173989c62dabf4c3b033d03a1f851e3f0cee991c4d7fbe62196823a58a5ef8e",
    "numbers": "e79c4a4f05368922c23a7b26d63e358bfa74388d2cf6be352f0efe8c479c3ddc",
    "latin_terms": "76bb30f5176048a0ac84b181152299d01708cb30eaed23f2d75432353ec553fc",
    "quotations": "cad4a5b3bac672060ea64a0d31b1659ec2ea63da00a9c660432089726fd63d85",
    "headings": "17c205cc6d52090b59af8d0923f69dd9510f176c432163c1bf369b1657659a63",
    "paragraphs": 24,
    "figures": 2,
    "details": 4
  },
  "16": {
    "structure": "dd214a48acc773b7d0f507cc4ba6a565669631bbffdddf52625d5586eaaf437b",
    "svg": "5856fa365f0bcbc8f64114cb4f7703245c76133b7bbce65106fe83d2144b9f1d",
    "code": "56681c6faf4cc9588cbb0e3ff4cd5e3ce3447fa8e304ad379d762c40f8bf791c",
    "links": "19592aa7236501688af0605cf628022afaa759fed21289cc266465942053569a",
    "ids": "b1fd7b630f21cc6dfc18088a48344d812694dcf403aa68e547ae61cd8df0dc91",
    "numbers": "aeb5f9ff32cafc68fad48a925abccab61aea365d0feb0eb18c4107618e163d6f",
    "latin_terms": "362f3d88cfafc65f09e0a247b958475f4ba7d9ad1c9f27ec511d55433eaa7a2b",
    "quotations": "ff47f9d0b5d962cc3f82a59ee59de511bb09de62aa22fcbdea670fc6c145ded4",
    "headings": "076a49b70b0aa3c9a5bfac2f64d024a434d79afea9d71100f145e0730503c9a3",
    "paragraphs": 59,
    "figures": 3,
    "details": 9
  }
}
ASSET_BASELINE = {
  "scenes/story-breaker-1.svg": "35499acf16cb00fbee93d06f30c0b270b2af09b5b486d96036e714d345fa3f81",
  "scenes/story-breaker-2.svg": "a4ddde12b91202520d44bb90517923680938a4a755236e262ba30ce9ebefa962",
  "scenes/story-breaker-3.svg": "750c8a05921d606a6deda59612751b255689900cabee18ed6ca9cfeaabc957ab",
  "scenes/story-breaker-4.svg": "dad9f98977164102cf139bf368f9c2cdb568155bcb0aebfb7751abcd39049c1e",
  "scenes/story-breaker-5.svg": "cc96d91f36f3dd4f6d06fd850de83fc342d8b00338df6dc22f306f6d7a1faa5a",
  "scenes/story-cache-1.svg": "9fe124858587584cec0af5ce13e572de4a877dde1eeac1f42455f2380ecb4875",
  "scenes/story-cache-2.svg": "df8776d7e764afd0ab90fdcda3e4923de22601f1b433848a2b4a7417f8970187",
  "scenes/story-cache-3.svg": "8b9ac74a402cf5ef443de0dfdbc64e9c0a7cd0711fd951de84d94f9f7766d339",
  "scenes/story-cache-4.svg": "ab822c167bc2b263ef614b03dfed7dd1e4a3fb9927589a763030ec1a7cb4df59",
  "scenes/story-cache-5.svg": "3b5ae6c525c06121a7dd72fbc01ffbe9bb2c24f05a2f46ef4f7e75de3ceaa504",
  "scenes/story-lsm-1.svg": "fe29b426f5c1751e8aa62190d05965d9395cf7a4528bcadc721ff7b359a627da",
  "scenes/story-lsm-2.svg": "6e0de5c602264a557330aa2dc4bbab8b839847adc3f2a2b6be805368b7a94b2e",
  "scenes/story-lsm-3.svg": "5311c072b994337f6ff1c7d5667c753456fed6287ea6e5a313001f84bb74b5a7",
  "scenes/story-lsm-4.svg": "92bda60f1ef19d5418b4e8800b4b09b8dc0f3c2e15cdadbb50c9a573371a55c8",
  "scenes/story-replica-1.svg": "bb594ee3ad142ec5268fc6db79f5fbe21537d99ad08a193407da625648c625b3",
  "scenes/story-replica-2.svg": "3855d2e3e43472a0dc9c811785f99c6a4c207b8287682a530fb7c7491933f107",
  "scenes/story-replica-3.svg": "0e0638d966aef6ff32dbd2b3918065e4216ec1289c83f03cbdeb5243a505e0a6",
  "scenes/story-replica-4.svg": "a7aab8d8afa2368883dff958b6cf8333f254fb305a905aab5f89f13ffd6dada5",
  "scenes/story-replica-5.svg": "da9c8ad219f8aea543ba6fbafef43f1f53453f44ba522fe2da0ecb00357640b9",
  "scenes/story-retry-1.svg": "faf1d68020aa7885cf1c3c6a19aebe5226e46b0f57c1c1843b959d267b5e99d9",
  "scenes/story-retry-2.svg": "ceda4142a599adc44bfe45e7c7d538c31f3f15d5b8fbe8d274cb225dcb9957c5",
  "scenes/story-retry-3.svg": "96ef608d3dfbac2d1ae541d0bd47a295a930d20d4cb40878d71b86c29c8c57fb",
  "scenes/story-retry-4.svg": "efd03070e3f8a5a154b0329337001620c9faf6cddcab6bf03f56533844279a62",
  "scenes/story-token-1.svg": "6d08a707961ee2cf6e88914b57f6cde3eed2da5ec07226afb867c70a35f147d2",
  "scenes/story-token-2.svg": "cb16df590422bbceb886b1fb3276328f1dba20bc4e83c9a27058683f267a3497",
  "scenes/story-token-3.svg": "4dfc825aaf9ba26b83b34aa7a6d8118c44ecdfa88d5e982bb571ec9bdb81c74d",
  "scenes/story-token-4.svg": "79cc904ac42ef622d75699636a84c6eeb6e13498a4ad1260af8671454b428e53",
  "scenes/story-token-5.svg": "3e38bbd892cd0a85f370af9d811e13b7f24239da251776a6ac6c09608ef67e25",
  "visuals/visual-01-map.svg": "5efa1205895c50c3b598dae1587e00118827932471d6a15040879c07d39f48e5",
  "visuals/visual-02-latency.svg": "492242ffb749c3de6ec9308509cee4f7f384f71edddc9e27e951858f6dcf12e5",
  "visuals/visual-02-replica.svg": "2c2599c3176fc13ce4a674a632cc22fe07e0c206b7df254f16db8e491e3e3261",
  "visuals/visual-03-domains.svg": "718862e03933307cbb4a27e06c698d8def4ba4152b33b7eecac67a6fc9e84ed9",
  "visuals/visual-04-ack.svg": "c598bfe04d780de8f09d251e75b133873bb23d19d8016e0abf70ee68013143fb",
  "visuals/visual-04-fanout.svg": "4fc4417ca35d32fa5edcbdca7a2bff361bc693698882aa74dedc077338e616de",
  "visuals/visual-05-cache.svg": "fd000f4ba0f68d14f8afde5caca7d5c292676e96522c7133fbe2514e7a518fbe",
  "visuals/visual-05-race.svg": "9c6da482a8532fbf6b2106eff772993f4b24bf66817cb0c332699416d182ddb0",
  "visuals/visual-06-backlog.svg": "9c6fce95e9369b3182ebe06eff97e945fb82f70c896575e51e19b6cb3159f399",
  "visuals/visual-06-pool.svg": "ed935918ca61abb51c88f19b5430c88e861a1b638f115f7e2e0ca01db890de1a",
  "visuals/visual-07-btree.svg": "f7b0be0844abdde61be34284339847c266ed965f4bc4c0087db40e7e98f78ff4",
  "visuals/visual-07-lsm.svg": "ba60de022f032fa6dad8a76834c146ff1f95bfcf50d811a053a654903b057d7f",
  "visuals/visual-08-cdn.svg": "61b513de32b079ac38e190ca3514c587de17c01c9a7307aabdc03dcf1eaa4e0f",
  "visuals/visual-09-budget.svg": "056148b14ea6254d0050c9a61d54fd2d627cd14983c03ef2e4dc6d75ce5bbf0a",
  "visuals/visual-09-jitter.svg": "f2ce25e8a71e6190ace9ce2e6c030e0b8b986a8d2fb8dbab150f94441de04a1b",
  "visuals/visual-09-offset.svg": "121a6fd924e6ea605bc809bfb341ab84aa493eb41975017660dcb4f318c8dbcc",
  "visuals/visual-10-batch.svg": "4d75c86a64333ed343a4bd1a1c9922a9b8f3fcfd6ddb83ae79c8bfe84ebc0b47",
  "visuals/visual-11-hotkey.svg": "20ef79639d86b6b3de762875e1e53855dfe42505b5117a8e9e958c425e35a9b6",
  "visuals/visual-11-ring.svg": "a0b59adcc893d2b6fabfac861e8af8a00ed18798f58e3a4a47b6620a921b91c8",
  "visuals/visual-12-scale.svg": "5cfec3c929097ac48bb5a60aba53f89a3989ba25d1321d36c5e33704f44fa979",
  "visuals/visual-12-token.svg": "83478b0b77ed602af480cb47695146b2118cbfe6de6b20872a4d442bb4b78315",
  "visuals/visual-13-breaker.svg": "35ac5df00489e339444f397f20124697fe72600e87b29def423cb53433b9ae14",
  "visuals/visual-13-bulkhead.svg": "6a9520737b40aa657e1fa7d206b479909593785e1ad471369353cd0bb4c1c7ce",
  "visuals/visual-14-loop.svg": "c30a694913acc6435259a9f2d419dd326c6bef2c7156eec64a641ac73584576a",
  "visuals/visual-15-revoke.svg": "d777bbfd25bb3da5ae3aa47e086b187491b077baa8430969fab761c2aecc17ae",
  "visuals/visual-16-auth.svg": "394225f0123dc16200cc4a439dfee5902ab9934da931dc37a04056604712a463",
  "visuals/visual-16-observe.svg": "6196d8b71050c01790c090777178feabf64799747676b42c6e5a7a542707c63b"
}
ALIASES = {
    ('01', 'Who will benefit from the course and how'): ['Who will benefit'],
    ('02', 'Summary of system requirements'): ['Summary of system requirements', 'Summary system requirements'],
    ('08', 'How to choose a network protocol'): ['How to choose network protocol'],
    ('09', 'What else to know to build reliable, scalable, and fast systems'): ['What else to know to build reliable scalable fast systems'],
    ('15', 'Guidelines for part 1 problems'): ['Guidelines'],
    ('16', 'Guidelines for part 2 problems'): ['Guidelines'],
}

# The user's later request allows exactly four explicit original-case labels.
# Remove only this exact added HTML for the original-content fingerprint check;
# no original text, existing link, figure, code, or attribute is exempted.
ORIGINAL_CASE_NOTE = '<p class="source-note" data-editorial-note="original-case">自編系統設計案例。以下列出本題的需求、規模與驗收條件。</p>'
ORIGINAL_CASE_ANCHORS = {
    '15': ['c15-url-shortening'],
    '16': ['c16-fraud-detection', 'c16-auth-system', 'c16-monitoring-system'],
}

def original_source(source):
    return source.replace(ORIGINAL_CASE_NOTE, '')


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True).encode()).hexdigest()

def fingerprints(source):
    source = original_source(source)
    return {
        'structure': digest(re.findall(r'<[^>]+>', source)),
        'svg': digest(re.findall(r'<svg\b.*?</svg>', source, re.S)),
        'code': digest(re.findall(r'<(?:pre|code)\b.*?</(?:pre|code)>', source, re.S)),
        'links': digest(re.findall(r'\bhref="[^"]*"', source)),
        'ids': digest(re.findall(r'\bid="[^"]*"', source)),
        'numbers': digest(Counter(re.findall(r'\d+(?:[.,]\d+)*', source))),
        'latin_terms': digest(Counter(re.findall(r'[A-Za-z][A-Za-z0-9_./-]*', source))),
        'quotations': digest(Counter(re.findall(r'「.*?」|『.*?』', source, re.S))),
        'headings': digest(re.findall(r'<h[234]\b.*?</h[234]>', source, re.S)),
        'paragraphs': len(re.findall(r'<p\b', source)),
        'figures': len(re.findall(r'<figure\b', source)),
        'details': len(re.findall(r'<details\b', source)),
    }

def plain(source):
    return html.unescape(re.sub(r'<[^>]+>', ' ', source))

def normalized(source):
    return ' '.join(re.findall(r'[a-z0-9]+', plain(source).lower()))

class Tree(HTMLParser):
    VOID = {'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'}
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = {'tag': 'document', 'attrs': {}, 'children': []}
        self.stack = [self.root]
    def handle_starttag(self, tag, attrs):
        node = {'tag': tag, 'attrs': dict(attrs), 'children': []}
        self.stack[-1]['children'].append(node)
        if tag not in self.VOID: self.stack.append(node)
    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in self.VOID: self.handle_endtag(tag)
    def handle_endtag(self, tag):
        for i in range(len(self.stack)-1, 0, -1):
            if self.stack[i]['tag'] == tag:
                del self.stack[i:]
                break
    def handle_data(self, text):
        self.stack[-1]['children'].append(text)

JS_TEST = r'''
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const payload=JSON.parse(fs.readFileSync(0,'utf8'));const checks=[];
function check(label,fn){fn();checks.push(label);}
const listeners={},timers=new Map();let nextTimer=0;
function matches(el,selector){
  if(!el.tag)return false;
  return selector.split(',').some(s=>{
    s=s.trim();const attrs=[...s.matchAll(/\[([^=\]]+)(?:="([^"]*)")?\]/g)];
    for(const [,key,value] of attrs)if(!(key in el.attrs)||(value!==undefined&&el.attrs[key]!==value))return false;
    s=s.replace(/\[[^\]]+\]/g,'');
    const id=s.match(/#([\w-]+)/);if(id&&el.attrs.id!==id[1])return false;
    for(const [,c]of s.matchAll(/\.([\w-]+)/g))if(!el.classList.contains(c))return false;
    const tag=s.match(/^[a-zA-Z][\w-]*/);return !tag||tag[0]===el.tag;
  });
}
class Element{
  constructor(tag,attrs={}){this.tag=tag;this.attrs={...attrs};this.children=[];this.parentElement=null;this.style={};this.events={};this.value=attrs.value||'';this.checked='checked'in attrs;
    this.classList={contains:c=>(this.attrs.class||'').split(/\s+/).includes(c),toggle:(c,force)=>{const set=new Set((this.attrs.class||'').split(/\s+/).filter(Boolean));if(force===undefined? !set.has(c):force)set.add(c);else set.delete(c);this.attrs.class=[...set].join(' ');}};
    this.dataset=new Proxy({}, {get:(_,k)=>this.attrs['data-'+k.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())],set:(_,k,v)=>{this.attrs['data-'+k.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())]=String(v);return true;}});
  }
  get textContent(){return this.children.map(x=>typeof x==='string'?x:x.textContent).join('');}set textContent(v){this.children=[String(v)];}
  get hidden(){return 'hidden'in this.attrs;}set hidden(v){if(v)this.attrs.hidden='';else delete this.attrs.hidden;}
  get disabled(){return 'disabled'in this.attrs;}set disabled(v){if(v)this.attrs.disabled='';else delete this.attrs.disabled;}
  setAttribute(k,v){this.attrs[k]=String(v);}getAttribute(k){return this.attrs[k]??null;}
  append(...items){for(const x of items){if(typeof x!=='string')x.parentElement=this;this.children.push(x);}}
  replaceChildren(...items){this.children=[];this.append(...items);}
  querySelectorAll(s){const out=[];const walk=e=>{for(const c of e.children){if(typeof c==='string')continue;if(matches(c,s))out.push(c);walk(c);}};walk(this);return out;}
  querySelector(s){return this.querySelectorAll(s)[0]||null;}
  closest(s){let e=this;while(e){if(matches(e,s))return e;e=e.parentElement;}return null;}
  contains(e){while(e){if(e===this)return true;e=e.parentElement;}return false;}
  addEventListener(type,fn){(this.events[type]||=[]).push(fn);}dispatch(type){for(const fn of this.events[type]||[])fn({target:this});}click(){if(!this.disabled)this.dispatch('click');}
}
function from(x){if(typeof x==='string')return x;const n=new Element(x.tag,x.attrs);n.append(...x.children.map(from));return n;}
const doc=from(payload.tree);doc.getElementById=id=>doc.querySelector('#'+id);doc.createElement=t=>new Element(t);doc.visibilityState='visible';doc.addEventListener=(type,fn)=>(listeners['doc:'+type]||=[]).push(fn);
const window={addEventListener:(type,fn)=>(listeners[type]||=[]).push(fn)};
const context={document:doc,window,console,setTimeout:fn=>{const id=++nextTimer;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id)};
vm.runInNewContext(payload.source,context,{filename:'visuals.js'});
const event=type=>{for(const fn of listeners[type]||[])fn();};const tick=()=>{for(const [id,fn]of [...timers]){timers.delete(id);fn();}};
const $=id=>doc.getElementById(id),model=window.SystemDesignVisuals;
check('All six stories initialize with exactly one frame and keyboard-scrollable diagrams',()=>{
 assert.equal(doc.querySelectorAll('.live-story').length,6);
 for(const p of doc.querySelectorAll('.live-story')){assert.equal(p.querySelectorAll('.story-frame').filter(f=>!f.hidden).length,1);assert.equal(p.querySelector('.story-controls').hidden,false);assert.equal(p.querySelector('.scene-scroll').getAttribute('tabindex'),'0');}
});
const story=$('story-cache'),frames=story.querySelectorAll('.story-frame'),action=n=>story.querySelector(`[data-story-action="${n}"]`);
check('Previous, next, reset, and direct reveal preserve selected-frame state',()=>{
 action('next').click();assert.equal(story.dataset.currentStep,'1');action('prev').click();assert.equal(story.dataset.currentStep,'0');assert.equal(action('prev').disabled,true);
 model.reveal(frames[3].querySelector('p'));assert.equal(story.dataset.currentStep,'3');model.reveal(null);action('reset').click();assert.equal(story.dataset.currentStep,'0');
});
check('Autoplay stops at the last frame and does not accumulate timers',()=>{
 action('play').click();for(let i=0;i<10;i++)tick();assert.equal(story.dataset.currentStep,'4');assert.equal(action('play').getAttribute('aria-pressed'),'false');assert.equal(timers.size,0);assert.equal(action('next').disabled,true);
 action('play').click();assert.equal(story.dataset.currentStep,'0');action('play').click();tick();assert.equal(story.dataset.currentStep,'0');assert.equal(timers.size,0);
});
check('Route changes, hidden chapters, and background tabs stop playback',()=>{
 action('play').click();event('hashchange');assert.equal(timers.size,0);
 action('play').click();story.closest('article').hidden=true;tick();assert.equal(action('play').getAttribute('aria-pressed'),'false');story.closest('article').hidden=false;
 action('play').click();doc.visibilityState='hidden';event('doc:visibilitychange');assert.equal(timers.size,0);doc.visibilityState='visible';
});
check('Printing reveals all 28 frames and restores each selected frame',()=>{
 action('next').click();const selected=story.dataset.currentStep;event('beforeprint');assert.equal(doc.querySelectorAll('.story-frame').filter(f=>!f.hidden).length,28);event('afterprint');assert.equal(story.dataset.currentStep,selected);assert.equal(frames.filter(f=>!f.hidden).length,1);
});
const q=$('lab-queue'),qq=n=>q.querySelector(`[data-q="${n}"]`);
check('Original queue experiment rejects overflow, drains, and resets',()=>{
 for(let i=0;i<6;i++)qq('tick').click();assert.equal(qq('backlog').textContent,'120 / 120');assert.equal(qq('done').textContent,'180');assert.equal(qq('rejected').textContent,'0');
 qq('tick').click();assert.equal(qq('rejected').textContent,'20');qq('workers').value='8';qq('workers').dispatch('input');for(let i=0;i<4;i++)qq('tick').click();assert.equal(qq('backlog').textContent,'0 / 120');assert.equal(qq('rejected').textContent,'20');qq('reset').click();assert.equal(qq('time').textContent,'0');assert.equal(qq('done').textContent,'0');
});
check('Queue conservation and capacity hold for 616 input combinations',()=>{
 let combinations=0;for(let a=0;a<=100;a+=10)for(let w=1;w<=8;w++)for(let b=0;b<=120;b+=20){const old={time:4,backlog:b,done:29,rejected:7};const n=model.queueStep(old,a,w);assert.equal(b+a,n.backlog+n.done-old.done+n.rejected-old.rejected);assert.ok(n.backlog>=0&&n.backlog<=120);assert.ok(n.done-old.done<=w*10);assert.equal(n.time,5);assert.equal(old.backlog,b);combinations++;}assert.equal(combinations,616);
});
const s=$('lab-shards'),ss=n=>s.querySelector(`[data-s="${n}"]`);
check('Original partition experiment preserves hot-key and total-overload semantics',()=>{
 assert.equal(ss('rate-0').textContent,'210/s · 過載');ss('split').checked=true;ss('split').dispatch('change');for(let i=0;i<4;i++)assert.equal(ss('rate-'+i).textContent,'75/s');ss('hot').value='240';ss('other').value='240';ss('hot').dispatch('input');for(let i=0;i<4;i++)assert.equal(ss('rate-'+i).textContent,'120/s · 過載');assert.ok(ss('warning').classList.contains('split-warning'));
 for(let hot=0;hot<=240;hot+=20)for(let other=0;other<=240;other+=40)for(const split of [false,true]){const loads=model.partitionLoads(hot,other,split);assert.equal(loads.reduce((a,b)=>a+b,0),hot+other);if(split)assert.ok(loads.every(x=>x===(hot+other)/4));}
});
console.log(JSON.stringify({passed:checks.length,checks}));
'''

class ContentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.chapters = {p.stem: p.read_text() for p in sorted((ROOT/'chapters').glob('*.html'))}
        cls.all = '\n'.join(cls.chapters.values())
    def test_all_16_chapters_preserve_protected_content(self):
        self.assertEqual(set(self.chapters), {f'{n:02}' for n in range(1,17)})
        for n, source in self.chapters.items():
            with self.subTest(chapter=n): self.assertEqual(fingerprints(source), BASELINE[n])
    def test_all_81_public_topics_are_still_covered(self):
        outline = json.loads((ROOT/'outline.json').read_text())
        count = 0
        for ch in outline['chapters']:
            headings = [normalized(h) for h in re.findall(r'<h[34]\b[^>]*>(.*?)</h[34]>', self.chapters[ch['id']], re.S)]
            for topic in ch['topics']:
                candidates = [topic] + ALIASES.get((ch['id'],topic), [])
                with self.subTest(chapter=ch['id'],topic=topic): self.assertTrue(any(normalized(c) in h for c in candidates for h in headings))
                count += 1
        self.assertEqual(count,81)
    def test_original_visual_exercise_and_reference_inventory(self):
        expected = {'h3':90, 'svg':76, 'figure':76, 'details':97, 'p':732}
        for tag,count in expected.items(): self.assertEqual(len(re.findall('<'+tag+r'\b',original_source(self.all))),count,tag)
        for cls,count in {'live-story':6,'story-frame':28,'visual-lab':2,'exercise':49,'visual-explainer':27}.items():
            self.assertEqual(len(re.findall(r'class="'+cls+r'"',self.all)),count,cls)
        self.assertIn('id="lab-queue"',self.all); self.assertIn('id="lab-shards"',self.all)
    def test_requested_original_case_labels_are_exact_and_bounded(self):
        self.assertEqual(self.all.count(ORIGINAL_CASE_NOTE),4)
        for chapter,source in self.chapters.items():
            anchors=ORIGINAL_CASE_ANCHORS.get(chapter,[])
            self.assertEqual(source.count(ORIGINAL_CASE_NOTE),len(anchors))
            for anchor in anchors:
                pattern=r'<h3 id="'+re.escape(anchor)+r'">.*?</h3>\s*'+re.escape(ORIGINAL_CASE_NOTE)
                self.assertRegex(source,pattern)
    def test_all_55_standalone_svg_assets_are_unchanged(self):
        self.assertEqual(len(ASSET_BASELINE),55)
        for path, expected in ASSET_BASELINE.items():
            with self.subTest(asset=path):
                self.assertEqual(hashlib.sha256((ROOT/path).read_bytes()).hexdigest(),expected)
    def test_ids_and_accessible_svg_labels_are_complete(self):
        ids = re.findall(r'\bid="([^"]+)"',self.all)
        self.assertEqual(len(ids),len(set(ids)))
        for svg in re.findall(r'<svg\b.*?</svg>',self.all,re.S):
            self.assertIn('role="img"',svg)
            labels = re.search(r'aria-labelledby="([^"]+)"',svg)
            self.assertIsNotNone(labels)
            for target in labels.group(1).split(): self.assertIn(f'id="{target}"',svg)
        self.assertNotRegex(self.all,r'<(?:script|iframe|embed|object)\b')
    def test_key_correctness_caveats_remain_explicit(self):
        for phrase in [
            'A 隨後把 v4 回填', '先解決 latest 指標的新鮮度',
            '結果提交後、ACK 前崩潰', '這不是寫入必然遺失，而是讀取落後',
            'WAL 是否開啟、是否同步', '同一層維持不重疊的鍵範圍',
            '只有確定不再需要的舊版本才能移除',
            '背壓', '最老工作年齡上限',
        ]: self.assertIn(phrase,self.all)
    def test_visual_models_and_interaction_lifecycle(self):
        tree = Tree(); tree.feed(self.all)
        payload = json.dumps({'tree':tree.root,'source':(ROOT/'source/visuals.js').read_text()})
        result = subprocess.run(['node','-e',JS_TEST],input=payload,text=True,capture_output=True)
        self.assertEqual(result.returncode,0,result.stderr)
        report=json.loads(result.stdout)
        self.assertEqual(report['passed'],8)
        print('\nOriginal visuals:',json.dumps(report,ensure_ascii=False))
    def test_built_output_retains_all_source_visuals_and_anchors(self):
        if not ARGS or not ARGS.html: self.skipTest('Supply --html to audit a completed build')
        built = ARGS.html.read_text()
        self.assertEqual(built.count(ORIGINAL_CASE_NOTE),4,'Rebuild to include all four original-case labels')
        for i,svg in enumerate(re.findall(r'<svg\b.*?</svg>',self.all,re.S)):
            self.assertTrue(svg in built,f'Source SVG {i+1} missing or altered in built output')
        for target in re.findall(r'\bid="([^"]+)"',self.all): self.assertIn(f'id="{target}"',built)
        for asset in ('source/legacy-visuals.css','source/visuals.js'):
            self.assertTrue((ROOT/asset).read_text() in built,f'Stale built asset: {asset}')
        self.assertIn('SystemDesignVisuals',built)
        self.assertIn('.story-frame',built)
        for phrase in ('系統設計','RocksDB','idempotency_key'): self.assertIn(phrase,built)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--html',type=Path)
    ARGS, remaining = parser.parse_known_args()
    unittest.main(argv=[__file__]+remaining,verbosity=2)
