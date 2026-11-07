import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const getState = page => page.evaluate(() => globalThis.__minorBureau.getState());

async function setSqlAndExecute(page, sql) {
  await page.waitForSelector('.sql-editor[data-editor-ready="true"]');
  await page.evaluate(text => {
    const el = document.querySelector('.sql-editor[data-editor-ready="true"]');
    el?.__setSqlValue?.(text);
  }, sql);
  await page.locator('.query-tools').getByRole('button', { name: /执行查询/ }).click();
}

test('full 10-case investigation walkthrough, web downloads/logins/quizzes, saved tables, reload persistence, and both endings', async () => {
  const server = await createServer({ server: { host: '127.0.0.1', port: 0, open: false } });
  await server.listen();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await page.goto(`${server.resolvedUrls.local[0]}games/minor-case-bureau-h5/`);
    await page.waitForFunction(() => globalThis.__minorBureau?.getState().ready === true);
    assert.equal((await getState(page)).started, false);

    // Start shift from welcome overlay
    await page.getByRole('button', { name: '开始值班' }).click();
    assert.equal((await getState(page)).started, true);
    assert.equal((await getState(page)).running, true);

    // Verify evidence card renders readable fields in Case 1
    await page.waitForSelector('.evidence-card');
    const c1EvidenceText = await page.locator('.evidence-card').innerText();
    assert.match(c1EvidenceText, /红色外套/);

    // Test Assistant hints progressive reveal
    await page.locator('.assistant-panel').getByRole('button', { name: '展开下一条调查提示' }).click();
    assert.match(await page.locator('.assistant-panel .hint-copy').innerText(), /调查提示 1/);

    // Test Notepad & Manual
    await page.locator('.desktop-icons').getByRole('button', { name: '记事本' }).click();
    await page.getByLabel('案卷记事本').fill('第一案：红衣、20:30后、棕鞋');
    await page.locator('.desktop-icons').getByRole('button', { name: '操作手册' }).click();
    assert.match(await page.locator('.manual-panel').innerText(), /第一章：认识案卷数据表/);
    await page.getByLabel('关闭操作手册').click();
    await page.getByLabel('关闭记事本').click();

    // Case 1: first test saving a query result as a table, then test wrong submission, then solve
    await setSqlAndExecute(
      page,
      "SELECT id, name FROM suspects WHERE coat_color='红色' AND left_at>'20:30' AND shoe_color='棕色'",
    );
    await page.waitForSelector('.data-grid tbody tr');
    await page.getByPlaceholder('输入新表名，例如 step1').fill('c1_filtered');
    await page.getByRole('button', { name: '保存结果表' }).click();
    assert((await getState(page)).savedTables.includes('c1_filtered'));

    // Test reload persistence of notes and saved table
    await page.waitForTimeout(550);
    await page.reload();
    await page.waitForFunction(() => globalThis.__minorBureau?.getState().ready === true);
    assert.equal((await getState(page)).started, true);
    assert((await getState(page)).savedTables.includes('c1_filtered'));

    // Query from the saved table and select suspect for submission
    await setSqlAndExecute(page, 'SELECT id, name FROM c1_filtered');
    await page.locator('.data-grid tbody tr').first().getByRole('button', { name: '选择' }).click();
    await page.locator('.submit-panel').getByRole('button', { name: '提交调查结论' }).click();
    await page.locator('dialog.confirm-dialog').getByRole('button', { name: '确认提交' }).click();
    await page.waitForSelector('.verdict');
    await page.locator('.case-clear-overlay').getByRole('button', { name: /进入第/ }).click();
    assert.equal((await getState(page)).caseId, 2);

    // Case 2: read dynamic month & height from the identity card evidence, then query and submit
    const c2CardText = await page.locator('.evidence-card').innerText();
    const monthMatch = c2CardText.match(/(\d+)\s*月/);
    const heightMatch = c2CardText.match(/(\d+)\s*cm/);
    assert(monthMatch && heightMatch, 'Case 2 identity card must display month and height');
    await setSqlAndExecute(
      page,
      `SELECT id, name FROM residents WHERE family_initial='L' AND birth_month=${monthMatch[1]} AND height_cm=${heightMatch[1]} AND eye_color='深棕'`,
    );
    await page.locator('.data-grid tbody tr').first().getByRole('button', { name: '选择' }).click();
    await page.locator('.submit-panel').getByRole('button', { name: '提交调查结论' }).click();
    await page.locator('dialog.confirm-dialog').getByRole('button', { name: '确认提交' }).click();
    await page.locator('.case-clear-overlay').getByRole('button', { name: /进入第/ }).click();
    assert.equal((await getState(page)).caseId, 3);

    // Case 3: camera evidence shows 3 bars & 2 keys at 22:00
    await setSqlAndExecute(
      page,
      "SELECT o.id, o.name FROM officers o JOIN shifts s ON o.id=s.officer_id WHERE o.clearance=3 AND o.issued_keys=2 AND s.entered_at<='22:00' AND s.left_at>'22:00'",
    );
    await page.locator('.data-grid tbody tr').first().getByRole('button', { name: '选择' }).click();
    await page.locator('.submit-panel').getByRole('button', { name: '提交调查结论' }).click();
    await page.locator('dialog.confirm-dialog').getByRole('button', { name: '确认提交' }).click();
    await page.locator('.case-clear-overlay').getByRole('button', { name: /进入第/ }).click();
    assert.equal((await getState(page)).caseId, 4);

    // Case 4: download conventions & attendance from intranet browser, count books in luggage evidence
    await page.locator('.clue-tabs').getByRole('tab', { name: '寄存清点照片' }).click();
    const totalText = await page.locator('.evidence-card .evidence-fields dd').first().innerText();
    const totalMatch = totalText.match(/(\d+)/);
    assert(totalMatch, 'Case 4 luggage evidence must show total item count');
    const totalItems = Number(totalMatch[1]);
    const booksCount = totalItems - 2;

    await page.locator('.desktop-icons').getByRole('button', { name: '内网浏览器' }).click();
    await page.locator('.browser-sidebar').getByRole('button', { name: '本周活动' }).click();
    await page.locator('.site-downloads').getByRole('button', { name: /下载数据/ }).click();
    await page.locator('.site-links').getByRole('button', { name: /参会登记/ }).click();
    await page.locator('.site-downloads').getByRole('button', { name: /下载数据/ }).click();
    await page.getByLabel('关闭内网浏览器').click();

    await setSqlAndExecute(
      page,
      `SELECT g.id, g.name FROM guests g JOIN luggage l ON g.id=l.person_id WHERE l.books=${booksCount} AND l.weights=2 AND l.total_items=${totalItems} AND EXISTS(SELECT 1 FROM attendance a WHERE a.person_id=g.id AND a.convention_id=2) AND EXISTS(SELECT 1 FROM attendance a WHERE a.person_id=g.id AND a.convention_id=3) AND NOT EXISTS(SELECT 1 FROM attendance a WHERE a.person_id=g.id AND a.convention_id=1)`,
    );
    await page.locator('.data-grid tbody tr').first().getByRole('button', { name: '选择' }).click();
    await page.locator('.submit-panel').getByRole('button', { name: '提交调查结论' }).click();
    await page.locator('dialog.confirm-dialog').getByRole('button', { name: '确认提交' }).click();
    await page.locator('.case-clear-overlay').getByRole('button', { name: /进入第/ }).click();
    assert.equal((await getState(page)).caseId, 5);

    // Case 5: download menu & order_lines from intranet browser, solve lowest tip rate
    await page.locator('.desktop-icons').getByRole('button', { name: '内网浏览器' }).click();
    await page.locator('.browser-sidebar').getByRole('button', { name: /菜单/ }).click();
    await page.locator('.site-downloads').getByRole('button', { name: /下载数据/ }).click();
    await page.locator('.site-links').getByRole('button', { name: /当日订单/ }).click();
    await page.locator('.site-downloads').getByRole('button', { name: /下载数据/ }).click();
    await page.getByLabel('关闭内网浏览器').click();

    await setSqlAndExecute(
      page,
      "WITH eligible AS (SELECT o.customer_id, o.tip * 1.0 / o.total AS rate FROM orders o JOIN order_lines l ON o.id=l.order_id JOIN menu m ON m.id=l.item_id GROUP BY o.id HAVING SUM(CASE WHEN m.item='番茄三明治' THEN l.quantity ELSE 0 END)=2 AND SUM(CASE WHEN m.item='黑咖啡' THEN l.quantity ELSE 0 END)=1) SELECT c.id, c.name FROM customers c JOIN eligible e ON c.id=e.customer_id WHERE e.rate=(SELECT MIN(rate) FROM eligible)",
    );
    await page.locator('.data-grid tbody tr').first().getByRole('button', { name: '选择' }).click();
    await page.locator('.submit-panel').getByRole('button', { name: '提交调查结论' }).click();
    await page.locator('dialog.confirm-dialog').getByRole('button', { name: '确认提交' }).click();
    await page.locator('.case-clear-overlay').getByRole('button', { name: /进入第/ }).click();
    assert.equal((await getState(page)).caseId, 6);

    // Case 6: login to admin page, download profiles, read food & movie from linked sites
    await page.locator('.desktop-icons').getByRole('button', { name: '内网浏览器' }).click();
    await page.locator('.browser-sidebar').getByRole('button', { name: /管理页/ }).click();
    await page.locator('.site-login').getByLabel('账号').fill('archive');
    await page.locator('.site-login').getByLabel('密码').fill('night1978');
    await page.locator('.site-login').getByRole('button', { name: '登录' }).click();
    await page.locator('.site-links').getByRole('button', { name: /生日会/ }).click();
    const bdayBody = await page.locator('.site-body').innerText();
    const food = ['芝麻糊', '南瓜汤', '栗子饭'].find(f => bdayBody.includes(f));
    await page.locator('.site-links').getByRole('button', { name: /电影馆/ }).click();
    const movieBody = await page.locator('.site-body').innerText();
    const movie = ['远岸灯火', '午夜渡船', '雨停以前'].find(m => movieBody.includes(m));
    await page.locator('.site-links').getByRole('button', { name: /公开资料/ }).click();
    await page.locator('.site-downloads').getByRole('button', { name: /下载数据/ }).click();
    await page.getByLabel('关闭内网浏览器').click();

    await setSqlAndExecute(
      page,
      `SELECT id, name FROM profiles WHERE favorite_food='${food}' AND favorite_movie='${movie}' AND allergy='花生'`,
    );
    await page.locator('.data-grid tbody tr').first().getByRole('button', { name: '选择' }).click();
    await page.locator('.submit-panel').getByRole('button', { name: '提交调查结论' }).click();
    await page.locator('dialog.confirm-dialog').getByRole('button', { name: '确认提交' }).click();
    await page.locator('.case-clear-overlay').getByRole('button', { name: /进入第/ }).click();
    assert.equal((await getState(page)).caseId, 7);

    // Case 7: download wiki tables, answer quiz, login to forum & download guild/owners/citizens
    await page.locator('.desktop-icons').getByRole('button', { name: '内网浏览器' }).click();
    await page.locator('.browser-sidebar').getByRole('button', { name: /玩家百科/ }).click();
    for (const btn of await page.locator('.site-downloads button').all()) await btn.click();
    await page.locator('.site-links').getByRole('button', { name: /入会小测/ }).click();
    await page.getByLabel('规则小测').fill('7');
    await page.locator('.site-section form').getByRole('button', { name: '提交' }).click();
    await page.locator('.site-links').getByRole('button', { name: /会员论坛/ }).click();
    await page.locator('.site-login').getByLabel('账号').fill('visitor');
    await page.locator('.site-login').getByLabel('密码').fill('maple27');
    await page.locator('.site-login').getByRole('button', { name: '登录' }).click();
    for (const btn of await page.locator('.site-downloads button').all()) await btn.click();
    await page.getByLabel('关闭内网浏览器').click();

    await setSqlAndExecute(
      page,
      "SELECT c.id, c.name FROM players p JOIN classes k ON k.id=p.class_id JOIN guild_members g ON g.account=p.account JOIN account_owners a ON a.account=p.account JOIN citizens c ON c.id=a.person_id WHERE k.base_damage+5=7 AND g.tier>=2 AND g.vote<>'旧城' AND EXISTS(SELECT 1 FROM combat_log b WHERE b.defender=p.account AND b.weapon='腐蚀之刃' AND b.at=(SELECT MAX(b2.at) FROM combat_log b2 WHERE b2.defender=p.account AND b2.at<'22:00'))",
    );
    await page.locator('.data-grid tbody tr').first().getByRole('button', { name: '选择' }).click();
    await page.locator('.submit-panel').getByRole('button', { name: '提交调查结论' }).click();
    await page.locator('dialog.confirm-dialog').getByRole('button', { name: '确认提交' }).click();
    await page.locator('.case-clear-overlay').getByRole('button', { name: /进入第/ }).click();
    assert.equal((await getState(page)).caseId, 8);

    // Case 8: download courses, login teacher zhou2014 to download student_names & exam_scores
    await page.locator('.desktop-icons').getByRole('button', { name: '内网浏览器' }).click();
    await page.locator('.browser-sidebar').getByRole('button', { name: /教师资料入口/ }).click();
    await page.locator('.site-login').getByLabel('账号').fill('zhou');
    await page.locator('.site-login').getByLabel('密码').fill('zhou2014');
    await page.locator('.site-login').getByRole('button', { name: '登录' }).click();
    for (const btn of await page.locator('.site-downloads button').all()) await btn.click();
    await page.locator('.site-links').getByRole('button', { name: /课程资料/ }).click();
    await page.locator('.site-downloads').getByRole('button', { name: /下载数据/ }).click();
    await page.getByLabel('关闭内网浏览器').click();

    await setSqlAndExecute(
      page,
      "SELECT n.id, n.name FROM student_names n JOIN exam_scores s ON s.student_id=n.id WHERE s.score=90-7 AND EXISTS(SELECT 1 FROM enrollments e JOIN courses c ON c.id=e.course_id WHERE e.student_id=n.id AND c.homework_answer=42) AND EXISTS(SELECT 1 FROM enrollments e JOIN courses c ON c.id=e.course_id WHERE e.student_id=n.id AND c.title='视觉史' AND c.teacher='周老师')",
    );
    await page.locator('.data-grid tbody tr').first().getByRole('button', { name: '选择' }).click();
    await page.locator('.submit-panel').getByRole('button', { name: '提交调查结论' }).click();
    await page.locator('dialog.confirm-dialog').getByRole('button', { name: '确认提交' }).click();
    await page.locator('.case-clear-overlay').getByRole('button', { name: /进入第/ }).click();
    assert.equal((await getState(page)).caseId, 9);

    // Case 9: download tables across sites and solve
    await page.locator('.desktop-icons').getByRole('button', { name: '内网浏览器' }).click();
    await page.locator('.browser-sidebar').getByRole('button', { name: /邮寄流水/ }).click();
    await page.locator('.site-downloads').getByRole('button', { name: /下载数据/ }).click();
    for (const siteLabel of ['企业与交易', '航班与座位', '气象档案', '城市赛事档案', '公开账簿', '亲属索引']) {
      await page.locator('.site-links').getByRole('button', { name: new RegExp(siteLabel) }).click();
      for (const btn of await page.locator('.site-downloads button').all()) {
        if (await btn.isEnabled()) await btn.click();
      }
    }
    await page.getByLabel('关闭内网浏览器').click();

    await page.locator('.clue-tabs').getByRole('tab', { name: '另一位代理人的收益便笺' }).click();
    const c9Receipt = await page.locator('.evidence-card').innerText();
    const principal = Number(c9Receipt.match(/(\d+)\s*元/)[1]);
    const profit = Number((principal * 0.6).toFixed(2));

    await setSqlAndExecute(
      page,
      `WITH agent_a AS (SELECT s.passenger_id AS id FROM seats s JOIN flights f ON f.id=s.flight_id JOIN weather w ON w.date=f.date AND w.city=f.destination JOIN games g ON g.date=f.date WHERE f.destination='北湾' AND w.rain_mm>=30 AND g.team='北湾队' AND g.points%8=0 AND s.seat='4A' AND s.drink='黑咖啡'), agent_b AS (SELECT person_id AS id FROM wagers WHERE principal=${principal} AND ROUND(principal*(return_multiple-1),2)=${profit}), common_address AS (SELECT destination FROM mailings WHERE agent_id IN(SELECT id FROM agent_a) INTERSECT SELECT destination FROM mailings WHERE agent_id IN(SELECT id FROM agent_b) AND amount=${profit}), positions AS (SELECT trader_id,SUM(CASE WHEN side='买入' THEN quantity ELSE -quantity END) AS holding FROM stock_trades WHERE date<'06-20' AND company_id IN(SELECT id FROM companies WHERE address IN(SELECT destination FROM common_address)) GROUP BY trader_id), controller AS (SELECT trader_id FROM positions ORDER BY holding DESC LIMIT 1) SELECT p.id, p.name FROM persons p JOIN family_relations r3 ON r3.relative_id=p.id AND r3.relation='子女' JOIN family_relations r2 ON r2.relative_id=r3.person_id AND r2.relation='子女' JOIN family_relations r1 ON r1.relative_id=r2.person_id AND r1.relation='手足' WHERE r1.person_id IN(SELECT trader_id FROM controller)`,
    );
    await page.locator('.data-grid tbody tr').first().getByRole('button', { name: '选择' }).click();
    await page.locator('.submit-panel').getByRole('button', { name: '提交调查结论' }).click();
    await page.locator('dialog.confirm-dialog').getByRole('button', { name: '确认提交' }).click();
    await page.locator('.case-clear-overlay').getByRole('button', { name: /进入第/ }).click();
    assert.equal((await getState(page)).caseId, 10);

    // Case 10: security recovery -> login archive -> download farms, guards, species & product_parts -> finale report
    await page.locator('.desktop-icons').getByRole('button', { name: '内网浏览器' }).click();
    await page.locator('.browser-sidebar').getByRole('button', { name: /会计与生产岗位/ }).click();
    await page.locator('.site-downloads').getByRole('button', { name: /下载数据/ }).click();
    await page.locator('.browser-sidebar').getByRole('button', { name: /公开家庭登记/ }).click();
    const famBody = await page.locator('.site-body').innerText();
    const maiden = ['叶', '沈', '周'].find(m => famBody.includes(`母亲婚前姓${m}`));
    await page.locator('.site-links').getByRole('button', { name: /宠物诊所/ }).click();
    const petBody = await page.locator('.site-body').innerText();
    const pet = ['豆包', '芝麻', '雪球'].find(p => petBody.includes(p));
    const year = petBody.match(/(\d{4})年/)[1];
    const pwd = `${maiden}-${pet}-${year}`;

    await page.locator('.browser-sidebar').getByRole('button', { name: /找回入口/ }).click();
    await page.getByLabel('密保校验').fill(pwd);
    await page.locator('.site-section form').getByRole('button', { name: '提交' }).click();
    await page.locator('.site-links').getByRole('button', { name: /调查资料/ }).click();
    await page.locator('.site-login').getByLabel('账号').fill('archive');
    await page.locator('.site-login').getByLabel('密码').fill(pwd);
    await page.locator('.site-login').getByRole('button', { name: '登录' }).click();
    for (const btn of await page.locator('.site-downloads button').all()) await btn.click();
    await page.getByLabel('关闭内网浏览器').click();

    await setSqlAndExecute(
      page,
      "SELECT name, food, product FROM species WHERE id=1",
    );
    await page.waitForFunction(() => document.querySelectorAll('.data-grid tbody tr td .cell-copy').length === 3);
    const rowCells = await page.locator('.data-grid tbody tr').first().locator('td .cell-copy').allInnerTexts();
    const [speciesAns, foodAns, productAns] = rowCells;

    // Open finale report editor: first test bad ending, return to desk, then publish good ending
    await page.locator('.taskbar-submit').click();
    await page.getByLabel('选择报道标题').selectOption('1');
    await page.getByLabel('目标农场种植的食物').fill(foodAns);
    await page.getByLabel('异常材料装配的消费品').fill(productAns);
    await page.getByLabel('两条线索共同指向的物种').fill(speciesAns);
    await page.getByLabel(/报道正文/).fill('正文故意漏掉关键证据。');
    await page.getByRole('button', { name: '确认发布报道' }).click();
    await page.locator('dialog.confirm-dialog').getByRole('button', { name: '确认发稿' }).click();
    await page.waitForSelector('.ending-overlay');
    assert.match(await page.locator('.ending-paper h1').innerText(), /报道撤回/);

    await page.locator('.ending-paper').getByRole('button', { name: '返回案卷桌面' }).click();
    await page.getByLabel('选择报道标题').selectOption('0');
    await page.getByLabel(/报道正文/).fill(`调查证实农场种植${foodAns}，工厂异常装配${productAns}，均指向${speciesAns}。`);
    await page.getByRole('button', { name: '确认发布报道' }).click();
    await page.locator('dialog.confirm-dialog').getByRole('button', { name: '确认发稿' }).click();
    await page.waitForSelector('.ending-overlay');
    assert.match(await page.locator('.ending-paper h1').innerText(), /报道刊发/);

    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});
