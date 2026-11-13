#include <algorithm>
#include <cstdio>
#include <string>
#include <vector>
#include <emscripten/emscripten.h>
#include "LawnApp.h"
#include "Lawn/Board.h"
#include "Lawn/System/PlayerInfo.h"
#include "Lawn/Widget/GameSelector.h"
#include "SexyAppFramework/graphics/GLImage.h"
#include "SexyAppFramework/graphics/Graphics.h"

namespace {
constexpr int glyphSize = 32;
constexpr int atlasColumns = 32;
std::vector<char32_t> chineseGlyphs;
uint32_t unlockedProfileId = 0;
bool challengesUnlocked = false;

int glyphIndex(char32_t character) {
    if (character < 0x2000 || chineseGlyphs.empty()) return -1;
    auto found = std::lower_bound(chineseGlyphs.begin(), chineseGlyphs.end(), character);
    return found != chineseGlyphs.end() && *found == character ? found - chineseGlyphs.begin() : -1;
}
}

bool greenhouse_challenges_unlocked() {
    if (!gLawnApp || !gLawnApp->mPlayerInfo) return false;
    const auto id = gLawnApp->mPlayerInfo->mId;
    if (id != unlockedProfileId) {
        int enabled = 0;
        gLawnApp->RegistryReadInteger("GreenhouseUnlockChallenges" + std::to_string(id), &enabled);
        unlockedProfileId = id;
        challengesUnlocked = enabled == 1;
    }
    return challengesUnlocked;
}

int greenhouse_glyph_width(char32_t character, int ascent) {
    return glyphIndex(character) < 0 ? 0 : std::max(8, ascent);
}

bool greenhouse_draw_glyph(Sexy::Graphics* graphics, char32_t character, const Sexy::Rect& dest, const Sexy::Color& color) {
    int index = glyphIndex(character);
    if (index < 0) return false;
    static auto* atlas = gLawnApp->GetImage("/game-assets/chinese-glyphs.png");
    if (!atlas) return false;
    Sexy::Rect source((index % atlasColumns) * glyphSize, (index / atlasColumns) * glyphSize, glyphSize, glyphSize);
    Sexy::Color previous = graphics->GetColor();
    graphics->SetColor(color);
    graphics->DrawImage(atlas, dest, source);
    graphics->SetColor(previous);
    return true;
}

extern "C" {
EMSCRIPTEN_KEEPALIVE void greenhouse_load_glyph_index() {
    auto* index = std::fopen("/game-assets/chinese-glyphs.bin", "rb");
    if (!index) return;
    char32_t codepoint;
    while (std::fread(&codepoint, sizeof(codepoint), 1, index) == 1) chineseGlyphs.push_back(codepoint);
    std::fclose(index);
}
EMSCRIPTEN_KEEPALIVE int greenhouse_ready() {
    return gLawnApp && gLawnApp->mLoadingThreadCompleted.load();
}

EMSCRIPTEN_KEEPALIVE int greenhouse_scene() {
    return gLawnApp ? static_cast<int>(gLawnApp->mGameScene) : -1;
}

EMSCRIPTEN_KEEPALIVE int greenhouse_ticks() {
    return gLawnApp ? gLawnApp->mUpdateCount : 0;
}

EMSCRIPTEN_KEEPALIVE int greenhouse_mode() {
    return gLawnApp ? static_cast<int>(gLawnApp->mGameMode) : -1;
}

EMSCRIPTEN_KEEPALIVE int greenhouse_board_ticks() {
    return gLawnApp && gLawnApp->mBoard ? gLawnApp->mBoard->mMainCounter : -1;
}

EMSCRIPTEN_KEEPALIVE int greenhouse_sun() {
    return gLawnApp && gLawnApp->mBoard ? gLawnApp->mBoard->mSunMoney : -1;
}

EMSCRIPTEN_KEEPALIVE int greenhouse_coins() {
    return gLawnApp && gLawnApp->mPlayerInfo ? gLawnApp->mPlayerInfo->mCoins * 10 : -1;
}

EMSCRIPTEN_KEEPALIVE int greenhouse_level() {
    return gLawnApp && gLawnApp->mPlayerInfo ? gLawnApp->mPlayerInfo->GetLevel() : -1;
}

EMSCRIPTEN_KEEPALIVE int greenhouse_can_jump() {
    return gLawnApp && gLawnApp->mPlayerInfo && gLawnApp->mGameScene == SCENE_MENU &&
           gLawnApp->mGameSelector && !gLawnApp->mBoard && gLawnApp->GetDialogCount() == 0;
}

EMSCRIPTEN_KEEPALIVE int greenhouse_set_coins(int coins) {
    if (greenhouse_coins() < 0 || coins < 0 || coins > 999990 || coins % 10 != 0) return 0;
    gLawnApp->mPlayerInfo->mCoins = coins / 10;
    gLawnApp->WriteCurrentUserConfig();
    return 1;
}

EMSCRIPTEN_KEEPALIVE int greenhouse_unlock_modes() {
    if (greenhouse_coins() < 0) return 0;
    auto& profile = *gLawnApp->mPlayerInfo;
    if (!gLawnApp->RegistryWriteInteger("GreenhouseUnlockChallenges" + std::to_string(profile.mId), 1)) return 0;
    unlockedProfileId = profile.mId;
    challengesUnlocked = true;
    profile.mHasUnlockedMinigames = 1;
    profile.mHasUnlockedPuzzleMode = 1;
    profile.mHasUnlockedSurvivalMode = 1;
    gLawnApp->WriteCurrentUserConfig();
    if (gLawnApp->mGameSelector) gLawnApp->mGameSelector->SyncProfile(false);
    return 1;
}

EMSCRIPTEN_KEEPALIVE int greenhouse_jump(int level) {
    if (!greenhouse_can_jump() || level < 1 || level > 50) return 0;
    gLawnApp->mPlayerInfo->SetLevel(level);
    gLawnApp->KillGameSelector();
    gLawnApp->PreNewGame(GAMEMODE_ADVENTURE, false);
    gLawnApp->WriteCurrentUserConfig();
    return 1;
}

EMSCRIPTEN_KEEPALIVE void greenhouse_set_speed(double multiplier) {
    if (!gLawnApp || !(multiplier >= 0.5 && multiplier <= 3.0)) return;
    gLawnApp->mUpdateMultiplier = multiplier;
    gLawnApp->ClearUpdateBacklog();
}

EMSCRIPTEN_KEEPALIVE int greenhouse_add_sun(int amount) {
    if (!gLawnApp || gLawnApp->mGameScene != SCENE_PLAYING || !gLawnApp->mBoard || amount <= 0 || amount > 1000) return -1;
    gLawnApp->mBoard->AddSunMoney(amount);
    return gLawnApp->mBoard->mSunMoney;
}

EMSCRIPTEN_KEEPALIVE void greenhouse_save_round() {
    if (gLawnApp && gLawnApp->mGameScene == SCENE_PLAYING && gLawnApp->mBoard && gLawnApp->mPlayerInfo) {
        gLawnApp->mBoard->TryToSaveGame();
    }
}
}
