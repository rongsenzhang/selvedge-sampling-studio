# 申请者演示指南

**[先体验规则工作坊](https://rongsenzhang.github.io/selvedge-sampling-studio/workshop.html)** · [打开裁切工作台](https://rongsenzhang.github.io/selvedge-sampling-studio/) · [查看 v1.0 发布记录](https://github.com/rongsenzhang/selvedge-sampling-studio/releases/tag/v1.0.0)

## v1.1 怎样演示 AI

在 **Production observation** 填一条虚构的英文观察。工作坊会显示当前部署是否支持实时生成。只有点击 **Generate a draft** 才会向 OpenAI 发送这段输入。出现 **Recorded OpenAI response** 时，页面展示的是注明模型和日期的预生成结果。演示使用合成数据，不涉及上传工厂工单、员工访谈或客户信息。

| 输入 | 招聘团队可以核查什么 |
| --- | --- |
| *For a fraying edge, reserve 7% of the planned cut length for a trial cut.* | 核对模型引用的原话、复核问题与反例。点击 **Use 7% in the draft** 采纳，再点 **Test proposal**。需要 28.80 米的工单加上试裁余量后需要 30.816 米，与 30 米库存相比缺 0.816 米。 |
| *For a fraying edge, allow some extra material for a trial cut.* | 这句话缺少可执行的百分比。检查助手是否要求澄清，以及页面是否阻止采纳未经说明的数值。即使没有实时服务，也可以在下方手工填写并测试。 |

后端利用 OpenAI Responses API 和严格的结构化输出，默认模型为 `gpt-4.1-mini`。服务端验证引文与百分比，浏览器再次核对原始观察。被采纳的草案要经过三组案例测试，再由生产负责人决定如何做实物试裁。公开网关的设计额度是每个 UTC 日总计 100 次、每个客户端 10 次。本机 Node 版为每个 UTC 日 24 次、每个滚动分钟 4 次。请求体上限均为 4 KiB。实时连通性以当前部署实际返回的结果为准。[AI 工作坊与验收方法](ai-workshop.md)

## 为什么选择布样册

Pike 为室内面料、软包和墙纸品牌设计制造实体样本，也提供储存、按长度裁切和寄样履约。布样册把客户要展示什么、生产能否裁出来、库存够不够三件事连在一起。Senator 已经提供材料处理与打样，Sampling International 提供电商履约和库存可视化，GB Patterns 生产多种形式及跨材料样册。这个项目选了一个招聘人员可以亲自重算的生产决策。完整调研列出网页清单、三家同行的重叠业务及访问限制。[公司与竞品调研](research.md)

## 三分钟怎样演示

| 操作 | 应该看到什么 | 可以解释的问题 |
| --- | --- | --- |
| 打开 Studio linen collection，展开 Compare cutting directions | 原方向需要 30.36 米，允许旋转时需要 28.80 米 | 每册每色各一片。每色分别取整行。尽管旋转后每排片数更少，每排沿布卷方向的长度缩短了。 |
| 把 Grain direction 改为 Keep original direction | 推荐方向和示意图改变，用料回到 30.36 米 | 限制方向后，展示效果或纹向要求会影响可行方案。 |
| 选 Short-roll launch，将 Total stock 从 37 改为 49.20 | 缺 12.20 米时拦截，补足后通过库存检查 | 合成库存假设每色等长。真实生产要按卷、按颜色单独验证。 |
| 选 Archive weave collection，填一条试裁说明、保存、重载并导出 | 方向受限，易散边需要人工复核；JSON 记录输入、规则版本、处理意见和估算 | 说明谁接手、该验证什么。公开版记录只保存在当前浏览器。 |
| 打开 Rule workshop，把 5% 改成 4%，重新检查 | 基于 30 米库存的边界案例从通过变为失败 | 演示如何把一条口述经验写成规则草案，并用反例讨论其适用范围。 |

## 技术路线和证据

- **需求**。从厂家网页识别输入、约束和需要人工判断的地方。真实工艺阈值、费率及历史数据均需企业核实。[业务研究](research.md)
- **决策**。枚举两种统一裁切方向，计算每色排数、用料和利用率，按整数便士核算示例成本。独立的规则解释状态，合成历史卡按可解释的相似度检索。该模型无需 OpenAI API。[公式与算例](model.md)
- **工程**。手机和电脑共用英文前端。GitHub Pages 上使用当前浏览器的 IndexedDB；Node 服务使用 SQLite，并可向其他客户端实时通知保存事件。两者共用规则与请求处理代码。[架构、数据模型和 API](technical-route.md)
- **验证和交付**。单元测试、真实 HTTP 接口测试和浏览器交互测试通过后，由 GitHub Actions 发布。所有演示资料随版本保留。[验证记录](validation.md)
- **岗位职责**。从需求访谈、员工培训、风险与预算决策到学术和行业传播，均有具体材料或试点方案。企业采用、实际节省及研究发表需另取证。[职责与交付对照](ktp-delivery.md)

这个项目使用了 AI 辅助调研和开发。申请和面试中，可以用自己复算过的结果、发现的限制、亲自做过的改动，分别说明作品证据与你个人的经验。
