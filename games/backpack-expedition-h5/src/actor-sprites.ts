const actors=['hero','twig','acorn','root','briar','shell','sapling','wither','amber','hollow','elite1','elite2','elite3','boss1','boss2','boss3'];
export const ACTOR_SPRITES:Record<string,number>=Object.fromEntries(actors.map((id,index)=>[id,index]));
