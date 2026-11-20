import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const entry = pathToFileURL(path.resolve('dist/games/after-hours-setup-h5/index.html')).href;
const artifacts = process.env.SETUP_SCREENSHOTS;

async function capture(page, name) {
  if (!artifacts) return;
  await mkdir(artifacts, { recursive: true });
  await page.screenshot({ path: path.join(artifacts, `${name}.png`), fullPage: true });
}

async function openMailByText(page, text) {
  await page.locator('.mail-tree-item', { hasText: text }).first().click();
}

async function launchExe(page, exeName) {
  await page.getByRole('button', { name: exeName }).click();
}

async function claimInMail(page, subjectText) {
  await openMailByText(page, subjectText);
  await page.getByRole('button', { name: /点击领取/ }).click();
}

async function waitForFinishAndComplete(page, preFinishFn) {
  await page.getByRole('button', { name: '完成', exact: true }).waitFor({ timeout: 12000 });
  if (preFinishFn) await preFinishFn();
  await page.getByRole('button', { name: '完成', exact: true }).click();
}

test('desktop completes full 16-level Outhook Express & Setup Wizard campaign', { timeout: 120000 }, async () => {
  const browser = await chromium.launch({ channel: process.env.SETUP_BROWSER_CHANNEL });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const failures = [];
    page.on('pageerror', err => failures.push(err.message));

    await page.goto(entry);
    await page.getByText('Outhook Express').waitFor();
    await capture(page, '01-inbox-initial');

    // Enable fast install and verify BGM track switcher in settings.
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: '下一首', exact: true }).click();
    await page.getByLabel('缩短安装进度条等待动画').check();
    await page.getByRole('button', { name: '确定', exact: true }).click();
    await page.getByText(/凌晨两点的收件箱/).waitFor();

    // Verify full 7-step interactive driver.js onboarding tour (asserting every highlighted DOM target!).
    const assertActiveTourTarget = async expected => {
      const actual = await page.evaluate(
        () => document.querySelector('.driver-active-element')?.getAttribute('data-tour')
          || document.querySelector('.driver-active-element')?.id
          || '',
      );
      assert.equal(actual, expected);
    };

    await page.getByRole('button', { name: '指南', exact: true }).click();
    await page.getByRole('button', { name: '互动新手指引', exact: true }).click();
    const tourPopover = page.locator('.driver-popover.win11-driver-popover');
    await tourPopover.getByText('1. 欢迎值守「装机夜班」').waitFor();
    await assertActiveTourTarget('status-strip');
    await capture(page, '00-onboarding-mail');
    await tourPopover.locator('.driver-popover-next-btn').click();
    await tourPopover.getByText('2. 认准带红点的待办邮件').waitFor();
    await assertActiveTourTarget('inbox-list');
    await tourPopover.locator('.driver-popover-next-btn').click();
    await tourPopover.getByText('3. 读清来信要求，点附件运行向导').waitFor();
    await assertActiveTourTarget('attachment-box');
    await capture(page, '00c-onboarding-step3');
    await tourPopover.locator('.driver-popover-next-btn').click();
    await tourPopover.getByText('4. 拆穿安装向导里的所有暗格').waitFor();
    await assertActiveTourTarget('wizard-content');
    await capture(page, '00b-onboarding-wizard');
    // Test stepping back to mail attachment and forward again.
    await tourPopover.locator('.driver-popover-prev-btn').click();
    await tourPopover.getByText('3. 读清来信要求，点附件运行向导').waitFor();
    await assertActiveTourTarget('attachment-box');
    await tourPopover.locator('.driver-popover-next-btn').click();
    await tourPopover.getByText('4. 拆穿安装向导里的所有暗格').waitFor();
    await assertActiveTourTarget('wizard-content');
    await tourPopover.locator('.driver-popover-next-btn').click();
    await tourPopover.getByText('5. 携带 0 个捆绑过关，翻车可看线索').waitFor();
    await assertActiveTourTarget('wizard-actions');
    await tourPopover.locator('.driver-popover-next-btn').click();
    await tourPopover.getByText('6. 领工单酬劳，结清 $7,000 尾款').waitFor();
    await assertActiveTourTarget('balance-chip');
    await tourPopover.locator('.driver-popover-next-btn').click();
    await tourPopover.getByText('7. 音乐切换、加速与随时重看指引').waitFor();
    await assertActiveTourTarget('guide-btn');
    await tourPopover.locator('.driver-popover-next-btn').click();
    await tourPopover.waitFor({ state: 'detached' });

    // Claim $12 coffee gift and test Trash/Recover on notice mail.
    await claimInMail(page, '先拿着这点咖啡钱顶一顶');
    await openMailByText(page, '值班须知');
    await page.getByRole('button', { name: '删除', exact: true }).click();
    await openMailByText(page, '值班须知');
    await page.getByRole('button', { name: '恢复', exact: true }).click();

    // Level 1: doghouse — test fail first, then clean pass!
    await openMailByText(page, '购物软件每次装完');
    await capture(page, '02-mail-selected');
    await launchExe(page, 'doghouse-v1.3-setup.exe');
    await capture(page, '03-setup-welcome');
    await page.getByRole('button', { name: '下一步', exact: true }).click();
    await page.getByLabel('我同意此协议').check();
    await page.getByRole('button', { name: '下一步', exact: true }).click();
    await page.getByRole('button', { name: '安装', exact: true }).click();
    await waitForFinishAndComplete(page);
    await page.getByText(/检测到 1 个/).waitFor();
    await capture(page, '04-detection-fail');
    await page.getByRole('button', { name: '查看排查线索' }).click();
    await page.getByRole('button', { name: '重新安装排查' }).click();

    await page.getByRole('button', { name: '下一步', exact: true }).click();
    await page.getByLabel('我同意此协议').check();
    await page.getByRole('button', { name: '下一步', exact: true }).click();
    await page.getByRole('button', { name: '安装', exact: true }).click();
    await waitForFinishAndComplete(page, async () => {
      await page.getByLabel(/实时资讯桌面助手/).uncheck();
    });
    await page.getByText(/0 个流氓捆绑软件/).waitFor();
    await page.getByRole('button', { name: '确定', exact: true }).click();
    await claimInMail(page, 'Re:求助！购物软件');

    // Level 2: gnome (wordplay)
    await openMailByText(page, '文字游戏');
    await launchExe(page, 'gnome-beauty-v3.7.exe');
    await page.getByLabel(/接收最新时尚资讯/).uncheck();
    await page.getByRole('button', { name: '下一步', exact: true }).click();
    await page.getByLabel('我同意此协议').check();
    await page.getByRole('button', { name: '下一步', exact: true }).click();
    await page.getByLabel(/极速下载器/).uncheck();
    await page.getByLabel(/一键修复/).uncheck();
    await page.getByLabel(/优兔/).uncheck();
    // Keep negative opt-outs checked!
    assert(await page.getByLabel(/取消安装/).isChecked());
    assert(await page.getByLabel(/不使用/).isChecked());
    await page.getByRole('button', { name: '下一步', exact: true }).click();
    await page.getByRole('button', { name: '安装', exact: true }).click();
    await waitForFinishAndComplete(page);
    await page.getByText(/0 个流氓捆绑软件/).waitFor();
    await page.getByRole('button', { name: '确定', exact: true }).click();
    await claimInMail(page, 'Re:可以帮帮我吗');

    // Level 3: bread (popup × escape)
    await openMailByText(page, '学做面包');
    await launchExe(page, 'toulon-bread-v2.1.exe');
    await page.getByLabel(/嬉皮紫月/).uncheck();
    await page.getByLabel(/实时天气/).uncheck();
    await page.getByLabel(/系统垃圾/).uncheck();
    await page.getByRole('button', { name: '下一步', exact: true }).click();
    await page.getByRole('button', { name: '忽略并继续' }).click();
    await page.getByLabel('我同意此协议').check();
    await page.getByRole('button', { name: '下一步', exact: true }).click();
    await page.getByRole('button', { name: '安装', exact: true }).click();
    await waitForFinishAndComplete(page);
    await page.getByText(/0 个流氓捆绑软件/).waitFor();
    await page.getByRole('button', { name: '确定', exact: true }).click();
    await claimInMail(page, 'Re:希望您帮帮我');

    // Level 4: pet (fake disabled Next on Finish page)
    await openMailByText(page, '爱犬');
    await launchExe(page, 'cute-pet-tribe-v1.0.exe');
    await capture(page, '05-pet-welcome');
    await page.getByRole('button', { name: '下一步', exact: true }).click();
    await page.getByLabel('我同意此协议').check();
    await page.getByRole('button', { name: '下一步', exact: true }).click();
    await page.getByLabel(/萌宠资讯/).uncheck();
    await page.getByLabel(/宠物健康/).uncheck();
    await page.getByLabel(/精美萌宠壁纸/).uncheck();
    await page.getByRole('button', { name: '安装', exact: true }).click();
    await page.getByRole('button', { name: '完成', exact: true }).waitFor();
    await page.getByRole('button', { name: '下一步', exact: true }).click();
    await page.getByLabel(/工厂特卖/).uncheck();
    await page.getByLabel(/冷知识/).uncheck();
    await page.getByLabel(/搞笑短视频/).uncheck();
    await page.getByLabel(/旅游攻略/).uncheck();
    await page.getByRole('button', { name: '完成', exact: true }).click();
    await page.getByText(/0 个流氓捆绑软件/).waitFor();
    await page.getByRole('button', { name: '确定', exact: true }).click();
    await claimInMail(page, 'Re:求助！我和我的爱犬');
    await claimInMail(page, '汪汪汪');

    // Level 5: accel (cancel during splash for lite)
    await openMailByText(page, '游戏加速器');
    await launchExe(page, 'violent-accel-v3.1.exe');
    await page.getByRole('button', { name: '取消', exact: true }).click();
    await page.getByRole('button', { name: '安装精简版' }).click();
    await page.getByRole('button', { name: '下一步', exact: true }).click();
    await page.getByLabel('我同意此协议').check();
    await page.getByRole('button', { name: '下一步', exact: true }).click();
    await page.getByLabel(/Gamesker/).uncheck();
    await page.getByLabel(/深度优化/).uncheck();
    await page.getByRole('button', { name: '安装', exact: true }).click();
    await waitForFinishAndComplete(page, async () => {
      await page.getByLabel(/高清影视盒/).uncheck();
    });
    await page.getByText(/0 个流氓捆绑软件/).waitFor();
    await page.getByRole('button', { name: '确定', exact: true }).click();
    await claimInMail(page, 'Re:我要疯了');

    // Level 6: eyecare (custom mode + mixed polarity)
    await openMailByText(page, '护眼定时软件');
    await launchExe(page, 'mutsu-eyecare-v2.4.exe');
    await page.getByRole('button', { name: '下一步', exact: true }).click();
    await page.getByLabel('我同意此协议').check();
    await page.getByRole('button', { name: '下一步', exact: true }).click();
    await page.getByLabel(/自定义安装/).check();
    await page.getByRole('button', { name: '下一步', exact: true }).click();
    await page.getByLabel(/私人眼科/).uncheck();
    await page.getByLabel(/UA 极速浏览器/).uncheck();
    await page.getByRole('button', { name: '下一步', exact: true }).click();
    await page.getByLabel(/开机接收/).uncheck();
    await page.getByRole('button', { name: '安装', exact: true }).click();
    await waitForFinishAndComplete(page, async () => {
      await page.getByLabel(/护眼周报/).uncheck();
    });
    await page.getByText(/0 个流氓捆绑软件/).waitFor();
    await page.getByRole('button', { name: '确定', exact: true }).click();
    await claimInMail(page, 'Re:请助我安装纯净');

    // Level 7: lettershop (hidden text button inside EULA)
    await openMailByText(page, '排版软件总会');
    await launchExe(page, 'ls-cs5-setup.exe');
    await page.getByLabel(/字体云端软件助手/).uncheck();
    await page.getByRole('button', { name: '下一步', exact: true }).click();
    await page.getByRole('button', { name: /安装 LetterShop 桌面快捷助手/ }).click();
    await page.getByLabel('我同意此协议').check();
    await page.getByRole('button', { name: '下一步', exact: true }).click();
    await page.getByLabel(/字库大百科/).uncheck();
    await page.getByLabel(/办公小助手/).uncheck();
    await page.getByRole('button', { name: '安装', exact: true }).click();
    await waitForFinishAndComplete(page);
    await page.getByText(/0 个流氓捆绑软件/).waitFor();
    await page.getByRole('button', { name: '确定', exact: true }).click();
    await claimInMail(page, 'Re:排版软件总会');

    // Level 8: ccsst (更多… + ⚙ 安装选项)
    await openMailByText(page, '天文软件');
    await launchExe(page, 'ccsst-v4.0-setup.exe');
    await page.getByRole('button', { name: '更多…' }).click();
    await page.getByLabel(/前沿天体物理/).uncheck();
    await page.getByLabel(/PadLab/).uncheck();
    await page.getByLabel(/分布式计算/).uncheck();
    await page.getByLabel(/师资招聘/).uncheck();
    await page.getByRole('button', { name: '确定', exact: true }).click();
    await page.getByRole('button', { name: '⚙ 安装选项' }).click();
    await page.getByLabel(/热门视频/).uncheck();
    await page.getByLabel(/网络加速/).uncheck();
    await page.getByLabel(/万能高速资源下载器/).uncheck();
    await page.getByRole('button', { name: '确定', exact: true }).click();
    await page.getByRole('button', { name: '下一步', exact: true }).click();
    await page.getByLabel('我同意此协议').check();
    await page.getByRole('button', { name: '下一步', exact: true }).click();
    await page.getByRole('button', { name: '安装', exact: true }).click();
    await waitForFinishAndComplete(page);
    await page.getByText(/0 个流氓捆绑软件/).waitFor();
    await page.getByRole('button', { name: '确定', exact: true }).click();
    await claimInMail(page, 'Re:我讨厌这些天文软件');

    // Level 9: seedking (checkbox inside EULA scroll)
    await openMailByText(page, '订购种子的软件');
    await launchExe(page, 'seed-king-v9.exe');
    await page.getByRole('button', { name: '下一步', exact: true }).click();
    await page.getByLabel(/奥德赛系列农业推广助手/).uncheck();
    await page.getByLabel('我同意此协议').check();
    await page.getByRole('button', { name: '下一步', exact: true }).click();
    await page.getByLabel(/农民好帮手/).uncheck();
    await page.getByLabel(/农业问答/).uncheck();
    await page.getByLabel(/特洛伊谷/).uncheck();
    await page.getByRole('button', { name: '安装', exact: true }).click();
    await waitForFinishAndComplete(page, async () => {
      await page.getByLabel(/致富新选择/).uncheck();
    });
    await page.getByText(/0 个流氓捆绑软件/).waitFor();
    await page.getByRole('button', { name: '确定', exact: true }).click();
    await claimInMail(page, 'Re:订购种子的软件');

    // Level 10: mhn (refuse EULA 4 times)
    await openMailByText(page, '林场看守人');
    await launchExe(page, 'mhn-v10.2-setup.exe');
    await page.getByLabel(/炫彩桌面主题/).uncheck();
    await page.getByRole('button', { name: '下一步', exact: true }).click();
    for (let i = 0; i < 4; i++) {
      await page.getByRole('button', { name: '下一步', exact: true }).click();
      if (i === 3) {
        await page.getByLabel(/不要安装「Internet Exploder」/).check();
      }
      await page.getByRole('button', { name: '确定', exact: true }).click();
      if (i < 3) await page.getByLabel('我同意此协议').uncheck();
    }
    await page.getByRole('button', { name: '下一步', exact: true }).click();
    await page.getByRole('button', { name: '安装', exact: true }).click();
    await waitForFinishAndComplete(page, async () => {
      await page.getByLabel(/万能驱动精灵/).uncheck();
      await page.getByLabel(/Office 361/).uncheck();
    });
    await page.getByText(/0 个流氓捆绑软件/).waitFor();
    await page.getByRole('button', { name: '确定', exact: true }).click();
    await claimInMail(page, 'Re:帮帮林场看守人');

    // Level 11: banquet (exit dialog hidden checks)
    await openMailByText(page, '图书馆清点藏书');
    await launchExe(page, 'library-helper-v3.exe');
    await page.getByLabel(/Souton/).uncheck();
    await page.getByLabel(/开机自动检测/).uncheck();
    await page.getByRole('button', { name: '取消', exact: true }).click();
    await page.getByLabel(/纯净轻量化无插件版本/).check();
    await page.getByLabel(/号角笛插画拓展包/).uncheck();
    await page.getByRole('button', { name: '继续安装' }).click();
    await page.getByRole('button', { name: '下一步', exact: true }).click();
    await page.getByLabel('我同意此协议').check();
    await page.getByRole('button', { name: '下一步', exact: true }).click();
    await page.getByLabel(/花艺摆盘大师/).uncheck();
    await page.getByRole('button', { name: '安装', exact: true }).click();
    await waitForFinishAndComplete(page);
    await page.getByText(/0 个流氓捆绑软件/).waitFor();
    await page.getByRole('button', { name: '确定', exact: true }).click();
    await claimInMail(page, 'Re:图书馆清点藏书');

    // Level 12: mediation (disappearing init check + click left artwork)
    await openMailByText(page, '总感觉哪里藏着东西');
    await launchExe(page, 'neighbor-guide-v2.exe');
    await page.getByLabel(/QICU/).uncheck();
    await page.getByRole('button', { name: '向导左侧插画' }).click();
    await page.getByLabel(/一刀 999/).uncheck();
    await page.getByLabel(/全能电脑安全卫士/).uncheck();
    await page.getByLabel(/情感交流论坛/).uncheck();
    await page.getByLabel(/今日头条/).uncheck();
    await page.getByLabel(/壁纸轮换器/).uncheck();
    await page.getByRole('button', { name: '下一步', exact: true }).click();
    await page.getByLabel('我同意此协议').check();
    await page.getByRole('button', { name: '下一步', exact: true }).click();
    await page.getByRole('button', { name: '安装', exact: true }).click();
    await waitForFinishAndComplete(page, async () => {
      await page.getByLabel(/情感调解门户/).uncheck();
    });
    await page.getByText(/0 个流氓捆绑软件/).waitFor();
    await page.getByRole('button', { name: '确定', exact: true }).click();
    await claimInMail(page, 'Re:这个指南软件');

    // Level 13: zdesign (step backward from Welcome!)
    await openMailByText(page, '设计吉祥物衣服');
    await launchExe(page, 'zdesign-fashion-v4.exe');
    await page.getByRole('button', { name: '上一步', exact: true }).click();
    await page.getByLabel(/9981/).uncheck();
    await page.getByLabel(/小鸟扭蛋/).uncheck();
    await page.getByLabel(/玫瑰网/).uncheck();
    await page.getByRole('button', { name: '上一步', exact: true }).click();
    await page.getByLabel(/雷霆健身/).uncheck();
    await page.getByLabel(/单车之家/).uncheck();
    await page.getByLabel(/最变态私服/).uncheck();
    await page.getByRole('button', { name: '下一步', exact: true }).click();
    await page.getByRole('button', { name: '下一步', exact: true }).click();
    await page.getByRole('button', { name: '下一步', exact: true }).click();
    await page.getByLabel('我同意此协议').check();
    await page.getByRole('button', { name: '下一步', exact: true }).click();
    await page.getByLabel(/Goodle/).uncheck();
    await page.getByLabel(/时尚杂志/).uncheck();
    await page.getByRole('button', { name: '安装', exact: true }).click();
    await waitForFinishAndComplete(page);
    await page.getByText(/0 个流氓捆绑软件/).waitFor();
    await page.getByRole('button', { name: '确定', exact: true }).click();
    await claimInMail(page, 'Re:设计吉祥物衣服');

    // Level 14: kindoor (right click context menu + EULA more options)
    await openMailByText(page, 'Kindoor 阅读器');
    await launchExe(page, 'kindoor-setup.exe');
    await page.locator('.setup-backdrop > div').click({ button: 'right' });
    await page.getByRole('menuitemcheckbox', { name: /安装精简版/ }).click();
    await page.getByRole('button', { name: '下一步', exact: true }).click();
    await page.getByRole('button', { name: '更多选项' }).click();
    await page.getByLabel(/MEC/).uncheck();
    await page.getByLabel(/DND/).uncheck();
    await page.getByLabel(/海量电子书/).uncheck();
    await page.getByRole('button', { name: '返回协议正文' }).click();
    await page.getByLabel('我同意此协议').check();
    await page.getByRole('button', { name: '下一步', exact: true }).click();
    await page.getByLabel(/音速世界/).uncheck();
    await page.getByRole('button', { name: '安装', exact: true }).click();
    await waitForFinishAndComplete(page);
    await page.getByText(/0 个流氓捆绑软件/).waitFor();
    await page.getByRole('button', { name: '确定', exact: true }).click();
    await claimInMail(page, 'Re:Kindoor 阅读器');

    // Level 15: mantis (switch from decoy to real + detach EULA clauses)
    await openMailByText(page, '小绿车资料软件');
    await launchExe(page, 'mantis-club-v0.5.exe');
    await page.getByRole('button', { name: /点击切换至「螳螂虾车友会官方直装向导」/ }).click();
    await page.getByLabel(/卡帕斯基/).uncheck();
    await page.getByLabel(/坏道德导航/).uncheck();
    await page.getByRole('button', { name: '下一步', exact: true }).click();
    await page.getByRole('button', { name: /附加服务条款 A/ }).click();
    await page.getByRole('button', { name: /附加服务条款 B/ }).click();
    await page.getByRole('button', { name: /附加服务条款 C/ }).click();
    await page.getByLabel('我同意此协议').check();
    await page.getByRole('button', { name: '下一步', exact: true }).click();
    await page.getByRole('button', { name: '安装', exact: true }).click();
    await waitForFinishAndComplete(page);
    await page.getByText(/0 个流氓捆绑软件/).waitFor();
    await page.getByRole('button', { name: '确定', exact: true }).click();
    await claimInMail(page, 'Re:我的小绿车资料软件');

    // Level 16: voodoo decoy -> subscribe official mail -> voodoo_real!
    await openMailByText(page, '显卡公司真是疯了');
    await launchExe(page, 'Voodoo-Driver.exe');
    await page.getByLabel(/发送官方最新驱动通知邮件/).check();
    await page.getByRole('button', { name: '下一步', exact: true }).click();
    await page.getByLabel('我同意此协议').check();
    await page.getByRole('button', { name: '下一步', exact: true }).click();
    await page.getByRole('button', { name: '安装', exact: true }).click();
    await waitForFinishAndComplete(page);
    await page.getByText(/已经发往 Outhook Express 收件箱/).waitFor();
    await page.getByRole('button', { name: '返回邮箱' }).click();

    await openMailByText(page, '感谢订阅！附上最新');
    await launchExe(page, 'Envida-Voodoo-V19.2.11.exe');
    await page.getByRole('button', { name: /游戏帮手竞技辅助/ }).click();
    await page.getByRole('button', { name: '下一步', exact: true }).click();
    await page.getByLabel('我同意此协议').check();
    await page.getByRole('button', { name: '下一步', exact: true }).click();
    await page.getByLabel(/软件百宝箱/).uncheck();
    await page.getByLabel(/3D Max/).uncheck();
    await page.getByLabel(/加固电脑安全卫士/).uncheck();
    await page.getByRole('button', { name: '安装', exact: true }).click();
    await waitForFinishAndComplete(page);
    await page.getByText(/0 个流氓捆绑软件/).waitFor();
    await page.getByRole('button', { name: '确定', exact: true }).click();
    await claimInMail(page, 'Re:这家显卡公司');

    // Pay final $7,000 settlement bill and reach Epilogue!
    await openMailByText(page, '尾款结算单');
    await page.getByRole('button', { name: /\$7000\.00 \(立即支付\)/ }).click();
    await page.getByRole('heading', { name: '天亮了，尾款已结清' }).waitFor();
    await capture(page, '06-epilogue');
    await page.getByRole('button', { name: '回到 Outhook Express' }).click();
    await page.reload();
    await page.locator('[data-testid="balance"]').getByText('$663.09').waitFor();
    assert.deepEqual(failures, []);
  } finally {
    await browser.close();
  }
});

test('360-pixel mobile layout fits cleanly and solves Level 1 and Level 12 artwork tap', { timeout: 30000 }, async () => {
  const browser = await chromium.launch({ channel: process.env.SETUP_BROWSER_CHANNEL });
  try {
    const page = await browser.newPage({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    await page.goto(entry);
    await page.getByText('Outhook Express').waitFor();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await capture(page, '07-mobile-inbox');

    // Verify driver.js onboarding tour fits cleanly on 360px mobile without horizontal overflow.
    await page.getByRole('button', { name: '指南', exact: true }).click();
    await page.getByRole('button', { name: '互动新手指引', exact: true }).click();
    const mobileTour = page.locator('.driver-popover.win11-driver-popover');
    await mobileTour.getByText('1. 欢迎值守「装机夜班」').waitFor();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await mobileTour.locator('.driver-popover-next-btn').click();
    await mobileTour.getByText('2. 认准带红点的待办邮件').waitFor();
    await mobileTour.locator('.driver-popover-next-btn').click();
    await mobileTour.getByText('3. 读清来信要求，点附件运行向导').waitFor();
    const mobileStep3Target = await page.evaluate(
      () => document.querySelector('.driver-active-element')?.getAttribute('data-tour') || '',
    );
    assert.equal(mobileStep3Target, 'attachment-box');
    await mobileTour.locator('.driver-popover-close-btn').click();
    await mobileTour.waitFor({ state: 'detached' });

    await openMailByText(page, '购物软件每次装完');
    await launchExe(page, 'doghouse-v1.3-setup.exe');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await capture(page, '08-mobile-setup');
    await page.getByRole('button', { name: '下一步', exact: true }).click();
    await page.getByLabel('我同意此协议').check();
    await page.getByRole('button', { name: '下一步', exact: true }).click();
    await page.getByRole('button', { name: '安装', exact: true }).click();
    await waitForFinishAndComplete(page, async () => {
      await page.getByLabel(/实时资讯桌面助手/).uncheck();
    });
    await page.getByText(/0 个流氓捆绑软件/).waitFor();
    await page.getByRole('button', { name: '确定', exact: true }).click();
  } finally {
    await browser.close();
  }
});
