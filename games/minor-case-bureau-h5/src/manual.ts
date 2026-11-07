import type { ManualChapter } from './types.ts';

export const manualChapters: ManualChapter[] = [
  {
    title: '第一章：认识案卷数据表',
    intro:
      '调查局的旧电脑不认直觉，只认结构化记录。每一份证人名单、门禁流水和账册，在系统里都是一张数据表（Table）。动手写查询前，先看清表里装了什么。',
    sections: [
      {
        title: '1.1 行与列：一条记录就是一个对象',
        body: '以第一案的嫌疑人登记表 suspects 为例：横向的每一“行”（Row）代表一名被盘查的街区人员；纵向的每一“列”（Column / 字段）记录同一类属性，包含编号（id）、姓名（name）、外套颜色（coat_color）、离开时间（left_at）和年龄（age）。',
        code: 'SELECT * FROM suspects;'
      },
      {
        title: '1.2 字段类型：文本、整数与小数',
        body: 'SQLite 中最常打交道的有三类值：TEXT（文本，如姓名与颜色，条件中需加单引号）、INTEGER（整数，如编号与年龄）以及 REAL（浮点数，如金额与比例）。把数字当文本或漏掉文本引号，是新手最常见的报错原因。',
        code: 'SELECT id, name, age FROM suspects LIMIT 5;'
      },
      {
        title: '1.3 主键与唯一标识',
        body: '同名同姓在霖港市并不罕见，因此每张人物表都配有唯一的身份列（如 suspects 表中的 id）。提交逮捕令时，系统核对的永远是唯一标识列，而不是可能重名的称呼。',
        code: 'SELECT id, name, coat_color FROM suspects ORDER BY id ASC;'
      }
    ]
  },
  {
    title: '第二章：基础提取——SELECT 与 FROM',
    intro:
      '查询语句的核心只有两个动作：指出数据来自哪张表（FROM），以及决定把哪些字段摆上桌面（SELECT）。',
    sections: [
      {
        title: '2.1 读取全部字段与指定字段',
        body: '星号 * 代表取出表内所有列，适合初次摸底；当表里有十几列时，直接点名需要的列（如 id, name, left_at）能让结果表干净易读。',
        code: 'SELECT id, name, coat_color, left_at FROM suspects;'
      },
      {
        title: '2.2 排序与去重：ORDER BY 与 DISTINCT',
        body: '目击者常按时间先后回忆现场。用 ORDER BY 列名 ASC（升序）或 DESC（降序）可重排记录；加 DISTINCT 则能看看现场一共出现过几种不同的外套颜色。',
        code: 'SELECT DISTINCT coat_color FROM suspects ORDER BY coat_color ASC;'
      },
      {
        title: '2.3 控制结果数量：LIMIT',
        body: '如果只需要排在最前面的几条记录（例如最早离开现场的三个人），在语句末尾加上 LIMIT 数量即可，不必翻阅整张长表。',
        code: 'SELECT id, name, left_at FROM suspects ORDER BY left_at ASC LIMIT 3;'
      }
    ]
  },
  {
    title: '第三章：精准排查——WHERE、布尔逻辑与 LIKE',
    intro:
      '把全城名单搬出来不算破案，按证词筛掉无关人选才是。WHERE 子句负责给每一行设卡，只有满足条件的记录才会留下。',
    sections: [
      {
        title: '3.1 比较运算与多条件组合（AND / OR）',
        body: '在 suspects 表中，可用 =、!=、<、<=、>、>= 比较数值或文本。多个线索必须同时成立时用 AND 连接；只要满足其一即可时用 OR，混用时记得加圆括号明确优先级。',
        code: "SELECT id, name, coat_color, left_at, age\nFROM suspects\nWHERE coat_color = '深灰' AND age >= 25 AND age <= 40;"
      },
      {
        title: '3.2 范围判断：BETWEEN 与 IN',
        body: '当目击者给出年龄段或几种可能的外套颜色时，BETWEEN ... AND ...（含首尾边界）与 IN (...) 比一长串等号清晰得多。',
        code: "SELECT id, name, age\nFROM suspects\nWHERE age BETWEEN 20 AND 35\n  AND coat_color IN ('军绿', '深灰', '藏青');"
      },
      {
        title: '3.3 模糊匹配：LIKE 与通配符',
        body: '物证上的字迹常有磨损。LIKE 配合百分号 %（代表任意长度字符）或下划线 _（代表单个字符），能根据半截时间、残缺卡号或 IP 前缀锁住目标。',
        code: "SELECT id, name, left_at\nFROM suspects\nWHERE left_at LIKE '21:%';"
      }
    ]
  },
  {
    title: '第四章：拼合多份卷宗——JOIN 与表别名',
    intro:
      '到了第三案以后，姓名、出入时间和领物记录往往分散在不同部门的表格里。通过共同的人物编号把多张表拼起来，才能还原完整行踪。',
    sections: [
      {
        title: '4.1 内连接：INNER JOIN ... ON',
        body: '以第三案的职员表 staff（含 id, name, accessory）与门禁记录表 building_logs（含 staff_id, enter_hour, exit_hour）为例，ON 后面写明两表对应的身份列，即可把人与出入时间对齐。',
        code: 'SELECT s.id, s.name, s.accessory, b.enter_hour, b.exit_hour\nFROM staff AS s\nINNER JOIN building_logs AS b ON s.id = b.staff_id;'
      },
      {
        title: '4.2 表别名与列别名（AS）',
        body: '多表都有 id 列时，直接写 id 会引发歧义。用 FROM staff AS s 给表起简短别名，再写 s.id 就能指明归属；用 SELECT s.id AS id 还能确保输出列名符合归档要求。',
        code: 'SELECT s.id AS id, s.name AS staff_name, p.items_taken\nFROM staff AS s\nJOIN supply_records AS p ON s.id = p.staff_id;'
      },
      {
        title: '4.3 三表连查与时间窗口判定',
        body: '当线索同时涉及人员配饰（staff）、22点整是否在楼内（building_logs）以及领取物资数量（supply_records）时，可以连续 JOIN 多张表，并在 WHERE 中写明进入与离开的小时边界。',
        code: 'SELECT s.id, s.name\nFROM staff AS s\nJOIN building_logs AS b ON s.id = b.staff_id\nJOIN supply_records AS p ON s.id = p.staff_id\nWHERE b.enter_hour <= 22 AND b.exit_hour > 22;'
      }
    ]
  },
  {
    title: '第五章：账目汇总——聚合函数、GROUP BY 与 HAVING',
    intro:
      '餐厅点单、企业采购与税务流水往往一人对应多行记录。要算清每个人的消费总额或小费比例，就得先把同一人的多行记录归拢成一组。',
    sections: [
      {
        title: '5.1 常用聚合函数：COUNT、SUM、AVG、MIN、MAX',
        body: '以第五案的点单明细表 order_items（含 customer_id, dish_id, portions）与菜单表 menu（含 dish_id, price）为例，SUM(portions * price) 可算出菜品总价，COUNT(*) 则统计点单条数。',
        code: 'SELECT COUNT(*) AS line_count, SUM(portions) AS total_portions\nFROM order_items;'
      },
      {
        title: '5.2 按人分组核算：GROUP BY',
        body: '将顾客表 customers（c）、点单表 order_items（oi）与菜单表 menu（m）连接后，按 c.id 分组，就能算出每位顾客的菜品消费总额，再除以该总额计算小费百分比。',
        code: 'SELECT c.id, c.name,\n       SUM(oi.portions * m.price) AS food_total,\n       c.tip_amount * 100.0 / SUM(oi.portions * m.price) AS tip_pct\nFROM customers AS c\nJOIN order_items AS oi ON c.id = oi.customer_id\nJOIN menu AS m ON oi.dish_id = m.dish_id\nGROUP BY c.id, c.name, c.tip_amount;'
      },
      {
        title: '5.3 筛除不符合汇总条件的组：HAVING',
        body: 'WHERE 在分组前过滤单行，HAVING 在分组后过滤汇总结果。例如只保留点单菜品不少于 2 种、且菜品总额达到门槛的顾客，必须把聚合条件写在 HAVING 子句里。',
        code: 'SELECT c.id, c.name, SUM(oi.portions * m.price) AS food_total\nFROM customers AS c\nJOIN order_items AS oi ON c.id = oi.customer_id\nJOIN menu AS m ON oi.dish_id = m.dish_id\nGROUP BY c.id, c.name\nHAVING COUNT(DISTINCT oi.dish_id) >= 2 AND SUM(oi.portions * m.price) >= 100;'
      }
    ]
  },
  {
    title: '第六章：嵌套推理——子查询与排除法',
    intro:
      '有些条件无法一步写死：比如“不在社团封机名单里的学生”，或者“合同总额高于全行业平均值的企业”。把一条查询装进另一条查询的括号里，就是子查询。',
    sections: [
      {
        title: '6.1 名单包含与排除：IN 与 NOT IN',
        body: '以第八案为例，students 表记录学生名单，club_locks 表记录某节课手机被锁进柜子的学生 student_id。用 NOT IN 子查询即可一键排除没有作案条件的人。',
        code: "SELECT s.id, s.name\nFROM students AS s\nWHERE s.id NOT IN (\n  SELECT student_id FROM club_locks WHERE period_code = 'WED_3'\n);"
      },
      {
        title: '6.2 标量子查询：与整体均值或极值比较',
        body: '在第九案核算供应合同表 supply_contracts（含 company_id, billed_amount）时，可用括号内的 SELECT AVG(billed_amount) 算出均值，再作为外层筛选的比较基准。',
        code: 'SELECT company_id, SUM(billed_amount) AS total_billed\nFROM supply_contracts\nGROUP BY company_id\nHAVING SUM(billed_amount) > (\n  SELECT AVG(billed_amount) FROM supply_contracts\n);'
      },
      {
        title: '6.3 派生表：把中间结果当作新表查询',
        body: '如果既要先按企业汇总材料成本差额，又要再连接企业主表 company_owners，可以把分组汇总写在 FROM (...) AS summary 里，外层再做关联与排序。',
        code: 'SELECT o.id, o.name, summary.overcharge\nFROM company_owners AS o\nJOIN companies AS c ON o.id = c.owner_id\nJOIN (\n  SELECT sc.company_id,\n         SUM(sc.billed_amount - sc.units_supplied * pc.material_unit_cost) AS overcharge\n  FROM supply_contracts AS sc\n  JOIN part_catalog AS pc ON sc.part_id = pc.part_id\n  GROUP BY sc.company_id\n) AS summary ON c.company_id = summary.company_id;'
      }
    ]
  },
  {
    title: '第七章：算术表达式、浮点精度与规则验算',
    intro:
      '旅馆房间里的行李件数、网络游戏的三回合伤害公式、港务舱单的吨位差额，都需要直接在 SQL 里列算式验证。',
    sections: [
      {
        title: '7.1 字段间的四则运算',
        body: '在第四案的客房清点表 hotel_rooms（含 room_no, bags_count, boxes_count）与参会人员表 attendees（含 id, room_no, registered_luggage）中，可以直接用加减法核对“房内实有箱包减去登记件数”的差值。',
        code: 'SELECT a.id, a.name, (r.bags_count + r.boxes_count - a.registered_luggage) AS diff\nFROM attendees AS a\nJOIN hotel_rooms AS r ON a.room_no = r.room_no;'
      },
      {
        title: '7.2 乘除优先级与整数除法陷阱',
        body: 'SQLite 中两个整数相除会直接截断小数（例如 5 / 100 得到 0）。计算小费占菜品总额百分比时，务必乘以 100.0 转为浮点数，并用括号包住分母表达式。',
        code: 'SELECT ROUND(18 * 100.0 / 120, 2) AS pct_example;'
      },
      {
        title: '7.3 还原复合公式：以战斗伤害为例',
        body: '第七案中，三回合总伤害公式为 (武器基础伤害 base_dmg + 职业加成 class_bonus) * 3 + 第三回合爆发 turn3_bonus。把文字规则原样翻译成 WHERE 算式，就能筛出唯一吻合的武器与角色组合。',
        code: 'SELECT gc.char_id, gc.char_name,\n       (w.base_dmg + rc.class_bonus) * 3 + w.turn3_bonus AS total_3turn_dmg\nFROM game_characters AS gc\nJOIN weapons AS w ON gc.weapon_id = w.weapon_id\nJOIN role_classes AS rc ON gc.class_id = rc.class_id;'
      }
    ]
  },
  {
    title: '第八章：微案调查方法论与结案复盘',
    intro:
      '越往后的案子，现成表格越少。真正的调查员不会只盯着初始表发呆，而是顺着内网地址、门户检索和证据链把缺口补齐。',
    sections: [
      {
        title: '8.1 跨站取证：从初始网页顺藤摸瓜',
        body: '浏览器里的初始站点往往只是入口。留意页面底部的站内链接、管理后台登录框、悬赏回帖与校验问答——成功交互后解锁或下载的数据表，常常握着破案缺的那一环。',
        code: "SELECT address, action_detail FROM net_logs WHERE ip_address LIKE '172.26.%';"
      },
      {
        title: '8.2 交叉验证：绝不依赖单一弱证据',
        body: '同一时间段在楼内的人可能不止一个，买过同款键帽的也不止一人。把时间窗口、算术差额、排除条件与跨站特征叠在一起，直到查询结果收敛为唯一一行。',
        code: 'SELECT e.id, e.name\nFROM executives AS e\nJOIN clearance_approvals AS ca ON e.id = ca.exec_id\nWHERE ca.override_flag = 1;'
      },
      {
        title: '8.3 终章报道核验：数字与标题同样重要',
        body: '在第十案发布深度报道前，除了锁定主使高管，还需用聚合查询核实漏缴税费总额、涉事批号与离岸账户。新闻标题必须严格对应证据链定性，任何夸大或算错的数值都会导致报道被撤回。',
        code: 'SELECT ca.exec_id,\n       SUM(hs.actual_tonnage - hs.declared_tonnage) AS tonnage_gap,\n       SUM(hs.customs_fee_evaded) AS total_evaded\nFROM clearance_approvals AS ca\nJOIN harbor_shipments AS hs ON ca.batch_code = hs.batch_code\nWHERE ca.override_flag = 1\nGROUP BY ca.exec_id;'
      }
    ]
  }
];
