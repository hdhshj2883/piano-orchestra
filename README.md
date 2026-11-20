# 琴转交响 · Piano → Orchestra

把钢琴独奏曲自动配器成 **大编制交响乐团 / 小编制室内乐团 / 流行乐队**，在浏览器里直接：

- 🎧 试听，并导出 WAV 音频
- 🎼 查看总谱（移调乐器按记谱音高），导出 MusicXML / 打印成 PDF
- 🎬 录制“动态总谱”视频（MP4 或 WebM）
- 🎹 导出多轨 MIDI，放进 DAW 继续制作

## 输入

| 输入 | 方式 |
|---|---|
| 内置曲目 | 巴赫《C大调前奏曲》BWV 846 |
| MIDI | 直接上传 |
| 乐谱 | MusicXML（.musicxml / .xml / .mxl）。PDF 乐谱请先用 Audiveris 或 MuseScore 转成 MusicXML |
| 录音 | 实验功能：用 Spotify basic-pitch 在浏览器里转写成音符 |

## 配器思路

1. 把乐曲按半小节切成窗口，提取 **旋律线**（最高声部）、**低音线**、**内声部和声**与原始 **琶音音型**
2. 根据力度、密度、音域、不协和度和全曲走向，给每小节算出强度等级 pp / mp / mf / ff
3. 每个乐器在每个等级下有固定角色（旋律、八度加倍、持续和声、低音、音型、打击），强度越高加入的乐器越多
4. 所有音符折叠进各乐器的实际音域

纯静态网页，无需后端。音色来自 FluidR3 GM（gleitz/midi-js-soundfonts），乐谱渲染使用 OpenSheetMusicDisplay。

## 音色来源

管弦乐与钢琴使用 [VSCO-2 Community Edition](https://github.com/sgossner/VSCO-2-CE)（CC0 公有领域）的真实录音采样：弦乐声部、木管、铜管、定音鼓、竖琴与立式钢琴。采样已截取、归一化并转为 AAC，放在 `samples/`。
