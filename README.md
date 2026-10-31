# 幽林纪 · DOS-AGE

幽林纪是 DOS-AGE v0.13 的非官方简体中文版，保留原作的像素风格、回合制探索、职业和战斗规则。

- **在线游玩：https://dosage.bitfroth.com/**
- **代码仓库：https://github.com/miaoz/dos-age-zh**
- 原作：https://dos-age.com/ （MEK.txt 与 .TIFF）

![中文像素字体预览](screenshots/pixel-font.jpg)

## 汉化内容

- 1,173 条界面与叙事文本，870 个名词及变体。
- 主菜单、职业、装备、技能、对话、战斗日志、帮助与设置。
- 默认简体中文，可在设置中切换英语。
- Fusion Pixel Font 12px 简体中文等宽像素字体，随项目内置，无需在线字体服务。
- 中文点阵缓存、最近邻放大及自动换行。当前语言包中的 1,240 个汉字及相关字符均有对应字形。
- 桌面与触屏布局，中文玩法说明页面。

死亡或生存天数结束后，直接显示本局分数，可点击“重新开始”或“返回标题画面”；键盘支持 R 重开、T / Esc 返回标题，无需填写昵称或提交分数。当前没有独立的联网排行榜。

## 游玩范围

游戏可以直接通过网站运行，也可以在本机启动。此独立版本未连接原站后端，因此全球排行榜、联网聊天、其他玩家回放以及服务器提供的亡魂和宿敌数据不可用。相关接口返回明确的离线状态。聊天输入中的 `/help` 仍可本地使用。

主菜单使用“幽林纪”中文像素标题，并保留 DOS-AGE 英文副标。原版动画图片中内嵌的英文（如 dodge）保留原图。游戏内容使用 2026-10-31 获取的原站 v0.13 资源；未穷尽验证每一种随机事件。

## 本地启动

需要 Node.js 22 或更高版本。本地游玩不需要安装 npm 依赖。

```sh
git clone https://github.com/miaoz/dos-age-zh.git
cd dos-age-zh
npm start
```

打开 http://127.0.0.1:4173/ 。macOS 可双击 `start.command`。按 Ctrl+C 停止服务；需要其他端口时运行 `PORT=4174 npm start`。

请使用 HTTP 服务，不要直接通过 `file://` 打开 HTML，因为浏览器需要加载 ES Modules 和语言 JSON。

## 画面异常恢复与诊断

右上角的“画面诊断”是独立于游戏 Canvas 的页面控件，游戏画面缺失时仍可使用。

- 地图、迷雾、字体和常用静态效果缓存保留一份 CPU 像素备份；2D 上下文恢复后重新填回原画布，不重开对局。
- 页面可见时每 2 秒抽查关键图集和少量其他缓存。发现图集透明或尺寸异常后立即检查全部已登记缓存；回到页面也会进行完整检查。此检测针对本次全透明故障，不等同于任意像素损坏检测。
- 再次出现异常时，先点“下载诊断记录”，再点“检查并恢复画面”。即使画面已经自动恢复，记录中仍可查看故障经过。
- JSON 包含最近 160 条事件、2D/WebGL 上下文丢失和恢复、缓存检查与恢复结果、游戏帧错误、浏览器与画布尺寸，以及异常时的回合、位置、生命值。事件保存在当前标签页的 sessionStorage 中，正常刷新后仍可导出；关闭标签页前应先下载。存储被禁用时仍有内存记录。
- 记录只留在本机，不自动上传。刷新页面可能丢失当前对局，优先尝试恢复。浏览器进程崩溃或页面被销毁时不能保证恢复游戏进度。

缓存备份随对应画布回收，监测器不强行保留已淘汰的字形。桌面开局实测备份约 11.2 MiB，实际占用随字体和效果缓存数量变化。

维护文件：`dist/render-health.js` 为恢复与诊断实现；`tools/render_recovery.py` 将挂钩应用到重新生成的汉化模块，避免运行生成脚本后丢失修复；`tools/check-render-health.mjs` 覆盖无事件清空、上下文恢复、尺寸重置及诊断存储。

## 维护与检查

```sh
python3 tools/build-language.py
python3 tools/apply-localization.py
npm run check
```

- `dist/lang/zh-CN.json`：生成后的中文语言包。
- `tools/strings-{a,b,c}.json`：分段翻译源文件。
- `tools/strings-dynamic.json`：原始词条表遗漏的动态文本，如洞穴楼层、冻结日志及召唤物法术名称。
- `tools/nouns-base.tsv`：统一术语和名词基础翻译。
- `tools/noun-contexts.json`：区分生物与技能名称；词缀按语境翻译，如精英史莱姆、精良的铁剑、强效火焰箭。召唤技能的词缀修饰召唤物。
- `tools/build-language.py`：合并翻译并生成名词变体。
- `tools/apply-localization.py`：基于 `tools/original/` 中的备份重建汉化模块。
- `dist/zh-font.js`、`dist/web/zh-font.css`：中文像素字体渲染与加载。
- `tools/check.mjs`：语言包覆盖度、变量、颜色标签、中文换行、语法、模块依赖和离线接口检查。
- `tools/check-game-over.mjs`：离线死亡与天数结束流程、结算按钮和键盘导航检查。
- `tools/check-dynamic.mjs`：执行楼层日志、战斗状态及法术名称的实际翻译路径，检查已有地图切换语言，并核对源码中的直接文本调用；这项检查不代表已穷尽所有运行时拼接文本。

GitHub Actions 在 push / pull request 时执行检查；推送到 `main` 后，检查通过会自动部署到正式网站。对翻译源的修改应运行上述生成命令并提交生成结果。`tools/fetch-original.py` 是最初下载资源的辅助脚本，不能当作无条件更新工具；升级原版需要重新匹配资源和语言模板。

## Cloudflare Pages 部署

项目名为 `dos-age-zh`，生产分支为 `main`，仅上传 `dist/`。自定义域名 `dosage.bitfroth.com` 指向 `dos-age-zh.pages.dev`。

```sh
npm ci
cp .env.example .env
# 在 .env 中填写 CLOUDFLARE_ACCOUNT_ID 和 CLOUDFLARE_API_TOKEN
npm run deploy
```

日常发布只需将修改推送到 `main`。工作流先验证生成文件是否同步并运行检查，通过后自动安装锁定的依赖、调用 `npm run deploy` 发布到正式网站。PR 和其他分支只做检查，不发布。也可在 GitHub Actions 的 **Check and deploy game → Run workflow** 中选择 `main` 手动重新部署。

部署使用仓库 Actions Secrets 中的 `CLOUDFLARE_ACCOUNT_ID` 与 `CLOUDFLARE_API_TOKEN`。令牌需要目标账户的 Cloudflare Pages 编辑权限。凭据仅注入部署步骤，不写入代码或上传到网站；本地 `.env` 仍只用于手动发布。生产部署串行执行，避免多个上传任务同时覆盖站点。

在 [GitHub Actions](https://github.com/miaoz/dos-age-zh/actions/workflows/check.yml) 查看每次检查和部署结果。检查失败时不会部署，线上继续保留上一次成功发布的版本。此方案沿用 Cloudflare Pages 的 [Direct Upload + CI 工作流](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/)。

- `wrangler.toml`：Pages 项目与静态目录配置。
- `dist/_worker.js`：对未接入的 `/scores` 和 `/chat` 接口返回 JSON 503。
- `dist/_routes.json`：仅上述接口运行 Function，游戏资源由 Pages 静态托管。
- `dist/404.html`：避免不存在的资源错误返回游戏首页。
- `dist/_headers`：资源缓存与响应头。

## 原作与许可

原作作者为 [MEK.txt](https://mektxt.com/) 与 [.TIFF](https://x.com/alexandratiff)。这是非官方汉化仓库，不代表原作者。原作代码、美术、字体、音效和音乐的权利归原作者及相应权利人所有，本仓库不为原作资源授予新的开源许可。

中文字体 Fusion Pixel Font 采用 SIL Open Font License 1.1，原始字体与上游许可均随附。详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
