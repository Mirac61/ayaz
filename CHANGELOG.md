# Changelog

## [0.9.0](https://github.com/Mirac61/ayaz/compare/v0.8.2...v0.9.0) (2026-11-16)


### Features

* **git:** &lt;Space&gt;go opens the line on GitHub, &lt;Space&gt;gy copies a permalink ([f30a3f4](https://github.com/Mirac61/ayaz/commit/f30a3f4a1ec732383e273ed251d0331c9b2002c1))
* **git:** &lt;Space&gt;go opens the line on GitHub, &lt;Space&gt;gy copies a permalink ([f8e586f](https://github.com/Mirac61/ayaz/commit/f8e586f712827ff534f5070d3d56c84e45e8a9c5))
* **tree:** c duplicates a file ([92404eb](https://github.com/Mirac61/ayaz/commit/92404eb7d84575a549f8c71a02af2dd3e5e36306))
* **tree:** c duplicates a file ([83e0ecb](https://github.com/Mirac61/ayaz/commit/83e0ecb186eb5f34dc805c18fe3cdfe4a94e9fe9))


### Bug Fixes

* **git:** keep the token out of bad remotes, keep a leading space in the prefix, strip head:// from links ([247231a](https://github.com/Mirac61/ayaz/commit/247231a965a904a80eebd1aa9aaccfa9a827ac5a))
* **tree:** copy writes through the handle it created, tests for backslash paths, umask and path cleaning ([4cb183e](https://github.com/Mirac61/ayaz/commit/4cb183e3b8694f95a9c7cbd2bd471208ea3a482e))
* **tree:** duplicate reveals the canonical path out of the filter, copy never exists wider than its source, refuse backslash paths on Windows ([687c307](https://github.com/Mirac61/ayaz/commit/687c30724f74f904d5ca06566254be4270b9b131))
* **tree:** reveal keeps the cursor on the revealed file, with a browser test for a filtered duplicate ([0146f9b](https://github.com/Mirac61/ayaz/commit/0146f9b1b7ce30c378d546ba808a8bb8a97ff325))
* **window:** ask about the current workspace when the close button is clicked ([167fd3c](https://github.com/Mirac61/ayaz/commit/167fd3c263c7469ab0a0ac98f3fb85971cba6ea2))
* **window:** close button does nothing after Switch folder ([191cbe2](https://github.com/Mirac61/ayaz/commit/191cbe2e43486d51ee79a79a015f7ea3e5ee3dec))

## [0.8.2](https://github.com/Mirac61/ayaz/compare/v0.8.1...v0.8.2) (2026-11-15)


### Bug Fixes

* **ui:** statusline fields overlapped, flatten the project chip ([01129f1](https://github.com/Mirac61/ayaz/commit/01129f134a08b59b9103ccefd4b40cfdb2a72a98))
* **ui:** statusline fields overlapped, flatten the project chip ([499fc16](https://github.com/Mirac61/ayaz/commit/499fc1646e4da1c7657a3e45ed62709ba5560d60))

## [0.8.1](https://github.com/Mirac61/ayaz/compare/v0.8.0...v0.8.1) (2026-11-15)


### Features

* Start page after the sternklar mockup ([#34](https://github.com/Mirac61/ayaz/issues/34)) ([fc2fd97](https://github.com/Mirac61/ayaz/commit/fc2fd9767c64b34b11c94ff26f461af895672623))


### Documentation

* **fsserve:** note that the script grant covers all workspaces ([#35](https://github.com/Mirac61/ayaz/issues/35)) ([5f599e2](https://github.com/Mirac61/ayaz/commit/5f599e2d640b136eed04a1e4f25ebd0a7da191bb))

## [0.8.0](https://github.com/Mirac61/ayaz/compare/v0.7.0...v0.8.0) (2026-11-15)


### Features

* Add sternklar theme ([1572479](https://github.com/Mirac61/ayaz/commit/15724799a67ab6107c09ec67b000a9576f9bc832))
* Clear hierarchy in the clone dialog ([e3928f3](https://github.com/Mirac61/ayaz/commit/e3928f3c470671405d053e50aaecc6f9deee13aa))
* Clear hierarchy in the clone dialog ([abff53a](https://github.com/Mirac61/ayaz/commit/abff53a7db1d08bbe599b95edb96874dbeedc039))
* Recent folders as a star chart on the start page ([8e6bd3c](https://github.com/Mirac61/ayaz/commit/8e6bd3cb2d267d57ef8a8358f899cd6bbd0a5cf1))
* Recent folders as a star chart on the start page ([cdb0294](https://github.com/Mirac61/ayaz/commit/cdb02942ae950287c754fc122e7b360050ae49c4))
* **settings:** add "ligatures" setting for the editor font ([00e95ed](https://github.com/Mirac61/ayaz/commit/00e95ed60db2c1d36fd840e9cfd411e4d8631b9b))
* **settings:** add "ligatures" setting for the editor font [task 29] ([0c5fbfd](https://github.com/Mirac61/ayaz/commit/0c5fbfd68e87612ad13d8a80dc770fcaf34dae05))
* Sidebar tabs and git remote actions as icons, visible commit field ([f447ed9](https://github.com/Mirac61/ayaz/commit/f447ed96837c1f5d1b5f925d47f75e77df916296))
* Sternklar theme, icon sidebar tabs and git actions ([df37879](https://github.com/Mirac61/ayaz/commit/df378797c964c3cfc5142762d83f7137e33f8694))
* Sternklar theme, star chart start page, ligatures setting ([c25d65e](https://github.com/Mirac61/ayaz/commit/c25d65e355782ac00472286cdd03ea11ac8b6fec))


### Bug Fixes

* **git:** english tooltips, short commit placeholder and nowrap remote buttons ([9172eb4](https://github.com/Mirac61/ayaz/commit/9172eb46156c08ffc2af188f2e9a08ba22e9a22b))
* **git:** english tooltips, short commit placeholder and nowrap remote buttons [task 28] ([18c7077](https://github.com/Mirac61/ayaz/commit/18c70775d8289990a3465eaebbbbed95536857d4))
* Keep star names inside the chart, plain key numbers ([21a0cf4](https://github.com/Mirac61/ayaz/commit/21a0cf4ba2c45a16b7ea856b8e425feb8b0e3b21))

## [0.7.0](https://github.com/Mirac61/ayaz/compare/v0.6.0...v0.7.0) (2026-11-15)


### Features

* **editor:** add non-vim standard mode toggle and statusline mode badge ([#21](https://github.com/Mirac61/ayaz/issues/21)) ([43233ef](https://github.com/Mirac61/ayaz/commit/43233efc73a0aff2ff865a86849f50b7d48272d9))
* **viewers:** add internal browser preview for html files ([#20](https://github.com/Mirac61/ayaz/issues/20)) ([43233ef](https://github.com/Mirac61/ayaz/commit/43233efc73a0aff2ff865a86849f50b7d48272d9))


### Bug Fixes

* address CodeRabbit review findings (preview base handling, workspace isolation, settings reload) ([43233ef](https://github.com/Mirac61/ayaz/commit/43233efc73a0aff2ff865a86849f50b7d48272d9))
* **git:** show git's reason in error messages and test the error paths ([#22](https://github.com/Mirac61/ayaz/issues/22)) ([43233ef](https://github.com/Mirac61/ayaz/commit/43233efc73a0aff2ff865a86849f50b7d48272d9))

## [0.6.0](https://github.com/Mirac61/ayaz/compare/v0.5.0...v0.6.0) (2026-11-14)


### Features

* **ci:** automate releases with release-please and multi-platform packaging ([6354c9f](https://github.com/Mirac61/ayaz/commit/6354c9faff1422ded9da106e17ddefb71a3b4555))
* **ci:** automate releases with release-please and multi-platform packaging ([4de984f](https://github.com/Mirac61/ayaz/commit/4de984f34c9084acd944d3b04b9e3a771a75926b))
* **docs:** dedicated DocsHub page with logical categories and smart markdown reading mode ([24f1b18](https://github.com/Mirac61/ayaz/commit/24f1b181ce5930e8a81a2d62b97777b850b3a2df))
* **docs:** dedicated DocsHub page with reading flow, light mode, and collapsible TOC ([86e1b2d](https://github.com/Mirac61/ayaz/commit/86e1b2d612f5b1189155ebdfff2cb84a24c77b8d))
* **docs:** polish DocsHub layout, add light mode, and collapsible TOC ([a668717](https://github.com/Mirac61/ayaz/commit/a6687172fbce002dc760978514eb2950e74680d4))
* Welcome Hub Relaunch, DocsHub & Automated Release Pipeline ([bc02899](https://github.com/Mirac61/ayaz/commit/bc0289975de0eb1522c2a1b44a904c31c26d3c8c))


### Bug Fixes

* **docs:** address CodeRabbit review feedback for DocsHub & reading flow ([4120c2c](https://github.com/Mirac61/ayaz/commit/4120c2c7c2bc20853a1418b4a665298544e6afe0))
* **review:** address CodeRabbit feedback for release workflow and DocsHub ([cee0ada](https://github.com/Mirac61/ayaz/commit/cee0ada89fb56d5ee085013c827b9983c5771166))
* **ui:** center welcome action tile icons with Lucide SVG components ([287a781](https://github.com/Mirac61/ayaz/commit/287a781604cc9edc8f6a3d2886de9b66ad5b5486))
* **ui:** center welcome action tile icons with Lucide SVG vectors ([82e8717](https://github.com/Mirac61/ayaz/commit/82e8717bce30e4ce609d0db543f380be8f8d91e6))
* **ui:** center welcome action tile icons with Lucide SVG vectors ([81c89dc](https://github.com/Mirac61/ayaz/commit/81c89dc7288e52b7e68488b5860f70f0f62a7ccb))
