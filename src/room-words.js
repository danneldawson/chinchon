'use strict';

// Room codes are real 4-letter words, English and Spanish, so a code can be
// read aloud across a table and typed without confusion.
//
// Rules for anything added here (enforced by test/room-codes.test.js):
//   - exactly 4 characters, ASCII A-Z only (no accents, no ñ — codes travel in
//     URLs and are typed by hand), and UPPERCASE
//   - family-safe: kids play this. No alcohol, weapons, violence, bodies or
//     anything that reads as an insult in either language
//   - no duplicates
//
// Codes are matched case-insensitively by the client (it uppercases input), so
// the stored form is uppercase.

const EN = [
  'ABLE', 'AREA', 'ARMY', 'BABY', 'BAKE', 'BALL', 'BAND', 'BARK', 'BARN', 'BATH',
  'BEAD', 'BEAM', 'BEAN', 'BEAR', 'BELL', 'BELT', 'BEND', 'BIRD', 'BLUE', 'BOAT',
  'BODY', 'BOLD', 'BOLT', 'BONE', 'BOOK', 'BOOT', 'BOWL', 'BULB', 'BUSH', 'CAKE',
  'CALM', 'CAMP', 'CANE', 'CAPE', 'CARD', 'CARE', 'CART', 'CASE', 'CAVE', 'CELL',
  'CHAT', 'CHEF', 'CHIN', 'CHIP', 'CITY', 'CLAM', 'CLAP', 'CLAY', 'CLIP', 'CLUB',
  'COAL', 'COAT', 'CODE', 'COIN', 'COLD', 'CONE', 'COOK', 'COOL', 'CORD', 'CORK',
  'CORN', 'COZY', 'CRAB', 'CREW', 'CROP', 'CUBE', 'CURL', 'DARK', 'DART', 'DASH',
  'DAWN', 'DECK', 'DEER', 'DENT', 'DESK', 'DIME', 'DISH', 'DIVE', 'DOCK', 'DOLL',
  'DOME', 'DOOR', 'DOVE', 'DRAW', 'DRUM', 'DUCK', 'DUNE', 'DUST', 'EARN', 'EAST',
  'ECHO', 'EDGE', 'EPIC', 'FACE', 'FACT', 'FAIR', 'FALL', 'FARM', 'FAST', 'FEET',
  'FERN', 'FILE', 'FILM', 'FIND', 'FIRE', 'FISH', 'FIST', 'FLAG', 'FLAT', 'FLEA',
  'FLIP', 'FLOW', 'FOAM', 'FOLD', 'FOOD', 'FOOT', 'FORK', 'FROG', 'FUEL', 'FULL',
  'GAME', 'GATE', 'GIFT', 'GIRL', 'GLOW', 'GOAL', 'GOAT', 'GOLD', 'GONG', 'GOWN',
  'GRAB', 'GRAY', 'GRID', 'GRIN', 'GRIP', 'GROW', 'GULL', 'HAIL', 'HAIR', 'HALF',
  'HALL', 'HAND', 'HARP', 'HAWK', 'HAZE', 'HEAD', 'HEAL', 'HEAP', 'HEAT', 'HERO',
  'HILL', 'HINT', 'HIVE', 'HOLD', 'HOLE', 'HOME', 'HOOF', 'HOOK', 'HOPE', 'HORN',
  'HOSE', 'HOST', 'HOUR', 'HUGE', 'HUNT', 'ICON', 'IRON', 'ITEM', 'JADE', 'JAZZ',
  'JEEP', 'JOIN', 'JOKE', 'JUMP', 'KALE', 'KEEN', 'KIND', 'KING', 'KITE', 'KNEE',
  'KNIT', 'KNOT', 'LACE', 'LAKE', 'LAMP', 'LAND', 'LANE', 'LAWN', 'LEAF', 'LEAN',
  'LEND', 'LENS', 'LIFT', 'LILY', 'LIME', 'LINE', 'LINK', 'LION', 'LIST', 'LOAF',
  'LOAN', 'LOCK', 'LOOP', 'LORD', 'LOUD', 'LUCK', 'LUNG', 'MAIL', 'MAIN', 'MAKE',
  'MARE', 'MARK', 'MASK', 'MAST', 'MATH', 'MEAL', 'MEAT', 'MELT', 'MEND', 'MENU',
  'MICE', 'MILD', 'MILK', 'MILL', 'MIND', 'MINE', 'MINT', 'MIST', 'MOAT', 'MODE',
  'MOLE', 'MOON', 'MOSS', 'MOTH', 'MOVE', 'MULE', 'MUST', 'NAME', 'NEAR', 'NEAT',
  'NEST', 'NEWS', 'NINE', 'NODE', 'NOSE', 'NOTE', 'OATS', 'ONCE', 'OPEN', 'ORCA',
  'OVAL', 'OVEN', 'OVER', 'PAGE', 'PAIL', 'PAIR', 'PALM', 'PARK', 'PATH', 'PEAK',
  'PEAR', 'PENS', 'PICK', 'PIER', 'PILE', 'PINE', 'PINK', 'PIPE', 'PLAN', 'PLAY',
  'PLOT', 'PLUM', 'POEM', 'POET', 'POND', 'PONY', 'POOL', 'PORT', 'POST', 'POUR',
  'PRAY', 'PUFF', 'PULL', 'PUMP', 'PURE', 'QUIZ', 'RACE', 'RAFT', 'RAIN', 'RAKE',
  'RAMP', 'READ', 'REED', 'REEF', 'REST', 'RICE', 'RICH', 'RIDE', 'RING', 'RISE',
  'ROAD', 'ROAM', 'ROAR', 'ROBE', 'ROCK', 'ROLE', 'ROOF', 'ROOM', 'ROOT', 'ROPE',
  'ROSE', 'RUBY', 'RULE', 'RUNE', 'RUSH', 'RUST', 'SAFE', 'SAGE', 'SAIL', 'SALT',
  'SAND', 'SASH', 'SAVE', 'SEAL', 'SEAM', 'SEAT', 'SEED', 'SEEK', 'SEEM', 'SELL',
  'SHIP', 'SHOE', 'SHOP', 'SHOW', 'SIDE', 'SIGN', 'SILK', 'SING', 'SINK', 'SITE',
  'SIZE', 'SKIN', 'SKIP', 'SLED', 'SLIM', 'SLIP', 'SLOW', 'SNAP', 'SNOW', 'SOAP',
  'SOFA', 'SOFT', 'SOIL', 'SONG', 'SORT', 'SOUL', 'SOUP', 'SPIN', 'SPOT', 'STAR',
  'STAY', 'STEM', 'STEP', 'STEW', 'STIR', 'STOP', 'SUIT', 'SWAN', 'SWIM', 'TAIL',
  'TAKE', 'TALE', 'TALK', 'TALL', 'TAME', 'TANK', 'TAPE', 'TASK', 'TEAM', 'TEND',
  'TENT', 'TERM', 'TEXT', 'THIN', 'TIDE', 'TIDY', 'TILE', 'TIME', 'TINY', 'TOAD',
  'TONE', 'TOOL', 'TOSS', 'TOUR', 'TOWN', 'TRAY', 'TREE', 'TRIM', 'TRIP', 'TRUE',
  'TUBE', 'TUNE', 'TURF', 'TURN', 'TWIG', 'TWIN', 'TYPE', 'UNIT', 'UPON', 'VANE',
  'VAST', 'VEIL', 'VEIN', 'VEST', 'VIEW', 'VINE', 'VOTE', 'WADE', 'WAGE', 'WAIT',
  'WAKE', 'WALK', 'WALL', 'WAND', 'WARM', 'WASH', 'WASP', 'WAVE', 'WEAK', 'WEAR',
  'WEEK', 'WELL', 'WEST', 'WIDE', 'WILD', 'WIND', 'WING', 'WISE', 'WISH', 'WOLF',
  'WOOD', 'WOOL', 'WORD', 'WORK', 'WORM', 'WRAP', 'YARD', 'YARN', 'YEAR', 'YOGA',
  'ZERO', 'ZONE', 'ZOOM',
];

const ES = [
  'AGUA', 'AIRE', 'ALAS', 'ALTO', 'AMOR', 'ARCO', 'ASNO', 'AVES', 'AZUL', 'BAJO',
  'BESO', 'BOCA', 'BOLA', 'BOTA', 'CABO', 'CAMA', 'CASA', 'CASI', 'CEJA', 'CENA',
  'CERA', 'CIMA', 'CINE', 'COLA', 'COPA', 'COSA', 'CUBO', 'CUNA', 'DADO', 'DATO',
  'DEDO', 'EDAD', 'ESTE', 'FAMA', 'FARO', 'FINA', 'FLOR', 'FOCA', 'GATO', 'GEMA',
  'GOMA', 'GOTA', 'GRIS', 'HADA', 'HOJA', 'HORA', 'IDEA', 'ISLA', 'JEFE', 'JUGO',
  'JUEZ', 'LANA', 'LATA', 'LAZO', 'LEON', 'LIMA', 'LOBO', 'LUNA', 'LUPA', 'MAIZ',
  'MANO', 'MAPA', 'MASA', 'MESA', 'META', 'MIEL', 'MISA', 'MODO', 'MOTO', 'MUDO',
  'MURO', 'NAVE', 'NIDO', 'NUBE', 'NUDO', 'OCHO', 'OJOS', 'OLOR', 'ONZA', 'PALA',
  'PALO', 'PAPA', 'PATA', 'PATO', 'PERA', 'PICO', 'PIES', 'PILA', 'PINO', 'PISO',
  'POCO', 'POLO', 'POZO', 'PUMA', 'RAMA', 'RANA', 'RATA', 'RAYO', 'REAL',
  'REMO', 'RETO', 'RISA', 'ROCA', 'ROJO', 'ROSA', 'SALA', 'SAPO', 'SEIS', 'SOGA',
  'SOPA', 'SUMA', 'TACO', 'TAPA', 'TAZA', 'TEJA', 'TELA', 'TEMA', 'TIZA', 'TODO',
  'TOMO', 'TOPO', 'TORO', 'TREN', 'VACA', 'VASO', 'VELA', 'VIDA', 'YATE', 'YESO',
  'YODO', 'ZUMO',
];

const WORDS = [...EN, ...ES];

module.exports = { WORDS, EN, ES };
