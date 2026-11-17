# Changelog

## [0.11.0](https://github.com/Mirac61/ayaz/compare/v0.10.0...v0.11.0) (2026-11-17)


### Features

* ACP: Go-Brücke (internal/acp, Stream acp) [[#45](https://github.com/Mirac61/ayaz/issues/45)] ([db889f0](https://github.com/Mirac61/ayaz/commit/db889f0c7d1591fe6e9590c3d133616f324a0c88))
* Dateien aus Finder und Dock in den Dateibaum ziehen ([#76](https://github.com/Mirac61/ayaz/issues/76)) ([46b66e1](https://github.com/Mirac61/ayaz/commit/46b66e17fd2d8f820a9661841d7514873227487b))
* Docs: Roadmap M83 und Manual-Checks für die QoL-Tasks nachziehen [[#44](https://github.com/Mirac61/ayaz/issues/44)] ([b4a9c91](https://github.com/Mirac61/ayaz/commit/b4a9c91fc07fa9406b4871ec55137beeef52e93e))
* Docs: Roadmap M83 und Manual-Checks für die QoL-Tasks nachziehen [task 44] ([1885781](https://github.com/Mirac61/ayaz/commit/1885781535a361716317d747ff1a56554dd535f3))
* Go-Test im Debugger (`<Space>rd`) [[#59](https://github.com/Mirac61/ayaz/issues/59)] ([#73](https://github.com/Mirac61/ayaz/issues/73)) ([7f4e661](https://github.com/Mirac61/ayaz/commit/7f4e66153d8be66c89f18af30e7f460e3f50acf6))
* Pass/Fail-Marker im Gutter [[#58](https://github.com/Mirac61/ayaz/issues/58)] ([#72](https://github.com/Mirac61/ayaz/issues/72)) ([2ffe90c](https://github.com/Mirac61/ayaz/commit/2ffe90cdc9146b06ef769739b4cdbb9773746b63))
* Test-Adapter für Python [[#66](https://github.com/Mirac61/ayaz/issues/66)] ([#71](https://github.com/Mirac61/ayaz/issues/71)) ([2f6a455](https://github.com/Mirac61/ayaz/commit/2f6a45552f2ef9c34844409576717fa4c8f45d74))
* Test-Adapter für TypeScript/JavaScript [[#57](https://github.com/Mirac61/ayaz/issues/57)] ([#70](https://github.com/Mirac61/ayaz/issues/70)) ([1c52f9b](https://github.com/Mirac61/ayaz/commit/1c52f9b58c69ced289d29124bd0e56f0806eb0fc))
* Test-Befehle, Lauf im Terminal und Ergebnisse (`shell/commands/tests.ts`) [[#56](https://github.com/Mirac61/ayaz/issues/56)] ([#69](https://github.com/Mirac61/ayaz/issues/69)) ([67cc895](https://github.com/Mirac61/ayaz/commit/67cc89577288b830064e988480c95a3583dd655b))
* Test-Runner: Modell und Go-Adapter (core/tests.ts) [[#55](https://github.com/Mirac61/ayaz/issues/55)] ([#64](https://github.com/Mirac61/ayaz/issues/64)) ([d459b6f](https://github.com/Mirac61/ayaz/commit/d459b6f1f3c2992cf0683e688788b8aa15cba943))


### Bug Fixes

* CodeRabbit-Review für jeden Agent-PR anstoßen, auch gegen dev ([#75](https://github.com/Mirac61/ayaz/issues/75)) ([2cbc4d7](https://github.com/Mirac61/ayaz/commit/2cbc4d7645519a37aa34e641ab6351430216be20))
* Kontextmenü im Glass-Modus lesbar (Blur wie Picker, kräftigere Schrift) ([#78](https://github.com/Mirac61/ayaz/issues/78)) ([02e5ec5](https://github.com/Mirac61/ayaz/commit/02e5ec54ef152db49a7e0ffd7711fdd127c5e7ed))
* release cleanup (vitest artifacts out of git, stylelint in CI, rename guard) ([#79](https://github.com/Mirac61/ayaz/issues/79)) ([b383987](https://github.com/Mirac61/ayaz/commit/b3839876650e437be3f3dca0b370d7fea01fc792))
* rename and duplicate onto an existing file ask to replace it ([#77](https://github.com/Mirac61/ayaz/issues/77)) ([7916753](https://github.com/Mirac61/ayaz/commit/7916753fe82a6079e4a1161819539b5df99c7b81))
* **ui:** Kopfzeile, Sidebar-Lag, Startseite und Glasmodus ([44b7375](https://github.com/Mirac61/ayaz/commit/44b737559cfa9d30c87c604972511bef2b0c0d8e))

## [0.10.0](https://github.com/Mirac61/ayaz/compare/v0.9.0...v0.10.0) (2026-11-16)


### Features

* **find:** `<Space>f.` resumes the last search picker with its text ([bfd5891](https://github.com/Mirac61/ayaz/commit/bfd5891721ceeae5f263c5d01d1cf58c2426d52e))
* **find:** `<Space>fT` lists TODO, FIXME, HACK and XXX comments ([4162d40](https://github.com/Mirac61/ayaz/commit/4162d40bc6c7845817fa9327fafccfe8c768eda3))
* **history:** Cmd/Ctrl+Enter restores an earlier save as unsaved changes ([3f74a15](https://github.com/Mirac61/ayaz/commit/3f74a15cd2a2f91bb3559dc626baf56ce97ae25e))
* **statusbar:** show "plain text" when a long line turns highlighting off ([311839d](https://github.com/Mirac61/ayaz/commit/311839d4b79a2da1b36204e156bf3433121c183a))
* **tasks:** ${file}, ${dir} and ${line} placeholders in settings tasks ([089273c](https://github.com/Mirac61/ayaz/commit/089273cad59e52c00e7e853c770ad1ae9c742bc7))
* **terminal:** file:line:col in terminal output opens the file ([57b2597](https://github.com/Mirac61/ayaz/commit/57b25973cae99026edc0f5904f663af209eb53ff))


### Bug Fixes

* **ci:** bump Go to 1.27.4 for GO-2026-6859 ([e42d613](https://github.com/Mirac61/ayaz/commit/e42d61328fa8c518b118edc7def804964e1f860e))
* **history:** review fixes for the restore pick ([b084564](https://github.com/Mirac61/ayaz/commit/b084564bc9db560bdb1f48d395aa8db8c07ab4d4))
* **picker:** Enter opens the selected hit of a streamed search ([df184f9](https://github.com/Mirac61/ayaz/commit/df184f9e87411884d3a07388cdd9274c73887958))
* **tasks:** quote-aware placeholder expansion, no expansion for doc builds ([12e8aa9](https://github.com/Mirac61/ayaz/commit/12e8aa923020e41eefa2b32645f351b512963ed8))
* **tasks:** refuse ${file}/${dir} where the quoting can't be told ([0793087](https://github.com/Mirac61/ayaz/commit/07930873884df6269222758c161ae7b8fe9e049c))
* **tasks:** treat any unquoted # as a possible comment ([e3033c7](https://github.com/Mirac61/ayaz/commit/e3033c74057bfee8af70f469f28ee5c96bd899df))
* **terminal:** file links use cell columns, not string offsets ([0dc2605](https://github.com/Mirac61/ayaz/commit/0dc260546e81636a69551803401e025ab99113eb))
* **terminal:** resolve a link against the cwd at its own column ([d8c2e7c](https://github.com/Mirac61/ayaz/commit/d8c2e7cd7ebf8f9c69581638c0b4851e0f8e6c4b))
* **terminal:** resolve file links against the output's cwd, skip wrapped rows, clamp column 0 ([da6aa68](https://github.com/Mirac61/ayaz/commit/da6aa68d3d062741b51542bdf3fb2b189935a07f))
* **terminal:** same-row cwd change, column 0 test, file links in the scratch terminal ([8d71d6e](https://github.com/Mirac61/ayaz/commit/8d71d6e9eef2f418082d12e011c0a230535a5d5e))

## [0.9.0](https://github.com/Mirac61/ayaz/compare/v0.8.2...v0.9.0) (2026-11-16)


### Features

* **git:** `<Space>go` opens the line on GitHub, `<Space>gy` copies a permalink ([f30a3f4](https://github.com/Mirac61/ayaz/commit/f30a3f4a1ec732383e273ed251d0331c9b2002c1))
* **tree:** c duplicates a file ([92404eb](https://github.com/Mirac61/ayaz/commit/92404eb7d84575a549f8c71a02af2dd3e5e36306))


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

## [0.8.1](https://github.com/Mirac61/ayaz/compare/v0.8.0...v0.8.1) (2026-11-15)


### Features

* Start page after the sternklar mockup ([#34](https://github.com/Mirac61/ayaz/issues/34)) ([fc2fd97](https://github.com/Mirac61/ayaz/commit/fc2fd9767c64b34b11c94ff26f461af895672623))


### Documentation

* **fsserve:** note that the script grant covers all workspaces ([#35](https://github.com/Mirac61/ayaz/issues/35)) ([5f599e2](https://github.com/Mirac61/ayaz/commit/5f599e2d640b136eed04a1e4f25ebd0a7da191bb))

## [0.8.0](https://github.com/Mirac61/ayaz/compare/v0.7.0...v0.8.0) (2026-11-15)


### Features

* Add sternklar theme ([1572479](https://github.com/Mirac61/ayaz/commit/15724799a67ab6107c09ec67b000a9576f9bc832))
* Clear hierarchy in the clone dialog ([e3928f3](https://github.com/Mirac61/ayaz/commit/e3928f3c470671405d053e50aaecc6f9deee13aa))
* Recent folders as a star chart on the start page ([8e6bd3c](https://github.com/Mirac61/ayaz/commit/8e6bd3cb2d267d57ef8a8358f899cd6bbd0a5cf1))
* **settings:** add "ligatures" setting for the editor font ([00e95ed](https://github.com/Mirac61/ayaz/commit/00e95ed60db2c1d36fd840e9cfd411e4d8631b9b))
* Sidebar tabs and git remote actions as icons, visible commit field ([f447ed9](https://github.com/Mirac61/ayaz/commit/f447ed96837c1f5d1b5f925d47f75e77df916296))


### Bug Fixes

* **git:** english tooltips, short commit placeholder and nowrap remote buttons ([9172eb4](https://github.com/Mirac61/ayaz/commit/9172eb46156c08ffc2af188f2e9a08ba22e9a22b))
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
* **docs:** dedicated DocsHub page with logical categories and smart markdown reading mode ([24f1b18](https://github.com/Mirac61/ayaz/commit/24f1b181ce5930e8a81a2d62b97777b850b3a2df))
* **docs:** polish DocsHub layout, add light mode, and collapsible TOC ([a668717](https://github.com/Mirac61/ayaz/commit/a6687172fbce002dc760978514eb2950e74680d4))


### Bug Fixes

* **docs:** address CodeRabbit review feedback for DocsHub & reading flow ([4120c2c](https://github.com/Mirac61/ayaz/commit/4120c2c7c2bc20853a1418b4a665298544e6afe0))
* **review:** address CodeRabbit feedback for release workflow and DocsHub ([cee0ada](https://github.com/Mirac61/ayaz/commit/cee0ada89fb56d5ee085013c827b9983c5771166))
* **ui:** center welcome action tile icons with Lucide SVG components ([287a781](https://github.com/Mirac61/ayaz/commit/287a781604cc9edc8f6a3d2886de9b66ad5b5486))
* **ui:** center welcome action tile icons with Lucide SVG vectors ([82e8717](https://github.com/Mirac61/ayaz/commit/82e8717bce30e4ce609d0db543f380be8f8d91e6))
