const weapons=['staff','thornstaff','elderstaff','dagger','hunterknife','silverknife','branchblade','bow','hunterbow','heartbow','mushroom','spore','nightspore','forkblade','mossbow','sproutshield'];
const equipment=['shield','potion','bread','boots','key','flower','arrows','ring','barkshield','dewpotion','nutbread','mossboots','oldkey','clover','barbedarrows','thornring','wardshield','goldpotion','feast','rangerboots','moonkey','sunflower','silverarrows','oakring','springcharm','thornshield','trailmix'];
export const ITEM_SPRITES:Record<string,{sheet:'weapons'|'equipment';index:number;rows:number}>=Object.fromEntries([
  ...weapons.map((id,index)=>[id,{sheet:'weapons' as const,index,rows:4}] as const),
  ...equipment.map((id,index)=>[id,{sheet:'equipment' as const,index,rows:7}] as const),
]);
