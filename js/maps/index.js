import { GREAT_BRITAIN } from './great-britain.js';
import { ICELAND } from './iceland.js';
import { JAPAN } from './japan.js';
import { NEW_ZEALAND } from './new-zealand.js';
import { CUBA } from './cuba.js';
import { ITALY } from './italy.js';

export const MAPS = [GREAT_BRITAIN, ICELAND, JAPAN, NEW_ZEALAND, CUBA, ITALY];
export const DEFAULT_MAP_ID = GREAT_BRITAIN.id;

export function getMapById(mapId) {
  return MAPS.find(map => map.id === mapId) || GREAT_BRITAIN;
}
