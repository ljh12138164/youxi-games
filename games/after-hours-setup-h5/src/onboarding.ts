import { driver, type Driver } from 'driver.js';

export const ONBOARDING_SEEN_KEY = 'after-hours-setup-h5/tour-seen-v1';

export type OnboardingHooks = {
  isFastMotion: () => boolean;
  selectSampleMail: () => void;
  openSampleWizard: () => void;
  closeSampleWizard: () => void;
  onPlayClick: () => void;
  onFinish: () => void;
};

/** Build the interactive multi-stage Windows 11 onboarding tour powered by driver.js. */
export function createOnboardingTour(hooks: OnboardingHooks): Driver {
  let openedDemoWizard = false;
  let pendingRaf = 0;

  const cancelPending = () => {
    if (pendingRaf) {
      cancelAnimationFrame(pendingRaf);
      pendingRaf = 0;
    }
  };

  const waitAndMove = (selector: string, moveFn: () => void) => {
    cancelPending();
    const deadline = performance.now() + 800;
    const poll = () => {
      const target = document.querySelector(selector);
      if (target && target.getBoundingClientRect().height > 0) {
        pendingRaf = 0;
        target.scrollIntoView({ block: 'center', behavior: 'instant' });
        requestAnimationFrame(moveFn);
        return;
      }
      if (performance.now() < deadline) {
        pendingRaf = requestAnimationFrame(poll);
        return;
      }
      pendingRaf = 0;
      moveFn();
    };
    pendingRaf = requestAnimationFrame(poll);
  };

  const tour = driver({
    showProgress: true,
    allowClose: true,
    allowKeyboardControl: true,
    disableActiveInteraction: true,
    smoothScroll: false,
    animate: !hooks.isFastMotion(),
    stagePadding: 6,
    stageRadius: 8,
    overlayColor: '#0b1930',
    overlayOpacity: 0.56,
    waitForElement: 1200,
    popoverClass: 'win11-driver-popover',
    closeBtnLabel: '关闭新手指引',
    nextBtnText: '下一步 →',
    prevBtnText: '← 上一步',
    doneBtnText: '开始值班',
    progressText: '第 {{current}} / {{total}} 步',
    onDestroyed: () => {
      cancelPending();
      if (openedDemoWizard) {
        openedDemoWizard = false;
        hooks.closeSampleWizard();
      }
      hooks.onFinish();
    },
    steps: [
      {
        element: '[data-tour="status-strip"]',
        popover: {
          title: '1. 欢迎值守「装机夜班」',
          description:
            '你要守着 Outhook Express 邮箱，帮求助客户干净装好 16 款软件，一个流氓插件都不能带。左下角看单量和当前音乐，攒够 $7,000.00 尾款就能天亮收工。',
          side: 'top',
          align: 'start',
          onNextClick: () => {
            hooks.onPlayClick();
            tour.moveNext();
          },
        },
      },
      {
        element: '[data-tour="inbox-list"]',
        popover: {
          title: '2. 认准带红点的待办邮件',
          description:
            '收件箱里标红的邮件就是待接委托和结算单。可以先点「先拿着这点咖啡钱顶一顶」领 $12 应急费；点「下一步」先打开第一封求助信看看。',
          side: 'right',
          align: 'start',
          onPrevClick: () => {
            hooks.onPlayClick();
            tour.movePrevious();
          },
          onNextClick: () => {
            hooks.onPlayClick();
            hooks.selectSampleMail();
            waitAndMove('[data-tour="attachment-box"]', () => tour.moveNext());
          },
        },
      },
      {
        element: '[data-tour="attachment-box"]',
        popover: {
          title: '3. 读清来信要求，点附件运行向导',
          description:
            '每封委托信都会写清客户最怕遇到哪种捆绑弹窗或推广。点击底下的 .exe 附件按钮，就会弹出对应软件的安装向导。我们点「下一步」进向导里看看真实暗格。',
          side: 'top',
          align: 'start',
          onPrevClick: () => {
            hooks.onPlayClick();
            tour.movePrevious();
          },
          onNextClick: () => {
            hooks.onPlayClick();
            openedDemoWizard = true;
            hooks.openSampleWizard();
            waitAndMove('[data-tour="wizard-content"]', () => tour.moveNext());
          },
        },
      },
      {
        element: '[data-tour="wizard-content"]',
        popover: {
          title: '4. 拆穿安装向导里的所有暗格',
          description:
            '千万别一路闭眼点下一步：预勾选框、正反话开关（「勾选=取消安装」）、许可协议正文里的文字按钮、「更多/安装选项」弹窗、假禁用按钮，甚至左侧插画背后和窗口右键菜单里都藏着捆绑开关！',
          side: 'left',
          align: 'center',
          onPrevClick: () => {
            hooks.onPlayClick();
            openedDemoWizard = false;
            hooks.closeSampleWizard();
            hooks.selectSampleMail();
            waitAndMove('[data-tour="attachment-box"]', () => tour.movePrevious());
          },
          onNextClick: () => {
            hooks.onPlayClick();
            tour.moveNext();
          },
        },
      },
      {
        element: '[data-tour="wizard-actions"]',
        popover: {
          title: '5. 携带 0 个捆绑过关，翻车可看线索',
          description:
            '走完安装点「完成」会立即进行安全检测，只有显示 0 个流氓捆绑软件才算合格。同一单只要失手过一次，检测弹窗就会开放「查看排查线索」。',
          side: 'top',
          align: 'end',
          onPrevClick: () => {
            hooks.onPlayClick();
            tour.movePrevious();
          },
          onNextClick: () => {
            hooks.onPlayClick();
            openedDemoWizard = false;
            hooks.closeSampleWizard();
            hooks.selectSampleMail();
            waitAndMove('[data-tour="balance-chip"]', () => tour.moveNext());
          },
        },
      },
      {
        element: '[data-tour="balance-chip"]',
        popover: {
          title: '6. 领工单酬劳，结清 $7,000 尾款',
          description:
            '每单干净装完，客户会发来回执邮件，点「点击领取」入账（比如第 1 单可领 $20）。攒到 $7,000.00 去红色结算单点「立即支付」即可通关。',
          side: 'top',
          align: 'end',
          onPrevClick: () => {
            hooks.onPlayClick();
            openedDemoWizard = true;
            hooks.openSampleWizard();
            waitAndMove('[data-tour="wizard-actions"]', () => tour.movePrevious());
          },
          onNextClick: () => {
            hooks.onPlayClick();
            tour.moveNext();
          },
        },
      },
      {
        element: '[data-tour="guide-btn"]',
        popover: {
          title: '7. 音乐切换、加速与随时重看指引',
          description:
            '点右侧「音乐」可随时静音或恢复播放，「设置」能切换 4 首钢琴曲或加速安装动画；点这里的「指南」或顶部「帮助」菜单，随时可以重播这套新手指引。',
          side: 'bottom',
          align: 'start',
          onPrevClick: () => {
            hooks.onPlayClick();
            tour.movePrevious();
          },
          onNextClick: () => {
            hooks.onPlayClick();
            tour.destroy();
          },
        },
      },
    ],
  });

  return tour;
}
