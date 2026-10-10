let audioCtx = null;

function playPachiSound() {
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();

        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(800, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(120, audioCtx.currentTime + 0.04);

        gain.gain.setValueAtTime(0.4, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.04);

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start();
        osc.stop(audioCtx.currentTime + 0.04);
    } catch (e) {}
}

const PIECE_TYPES = {
    1: { name: '歩', promoted: 'と' },
    2: { name: '香', promoted: '杏' },
    3: { name: '桂', promoted: '圭' },
    4: { name: '銀', promoted: '全' },
    5: { name: '金', promoted: null },
    6: { name: '角', promoted: '馬' },
    7: { name: '飛', promoted: '竜' },
    8: { name: '王', promoted: null }
};

let board = Array(9).fill(null).map(() => Array(9).fill(null));
let hands = { sente: [], gote: [] };

let turn = 'sente';
let selectedCoord = null;
let selectedHandIndex = null;
let movableCoords = [];

function initBoard() {
    board = Array(9).fill(null).map(() => Array(9).fill(null));
    hands = { sente: [], gote: [] };

    const setupLine = [2, 3, 4, 5, 8, 5, 4, 3, 2];

    for (let c = 0; c < 9; c++) board[0][c] = createPieceObj([setupLine[c]], 'gote');
    board[1][1] = createPieceObj([7], 'gote');
    board[1][7] = createPieceObj([6], 'gote');
    for (let c = 0; c < 9; c++) board[2][c] = createPieceObj([1], 'gote');

    for (let c = 0; c < 9; c++) board[6][c] = createPieceObj([1], 'sente');
    board[7][1] = createPieceObj([6], 'sente');
    board[7][7] = createPieceObj([7], 'sente');
    for (let c = 0; c < 9; c++) board[8][c] = createPieceObj([setupLine[c]], 'sente');
}

function createPieceObj(types, owner) {
    return {
        types: types.map(t => typeof t === 'number' ? { type: t, isPromoted: false } : t),
        owner: owner
    };
}

function hasNifu(col, owner) {
    for (let r = 0; r < 9; r++) {
        let p = board[r][col];
        if (p && p.owner === owner) {
            if (p.types.some(t => t.type === 1 && !t.isPromoted)) {
                return true;
            }
        }
    }
    return false;
}

function getMovableCoords(r, c, pieceObj) {
    let moves = [];
    pieceObj.types.forEach(p => {
        let raw = getRawMoves(p.type, p.isPromoted, pieceObj.owner, r, c);
        raw.forEach(m => {
            if (!moves.some(e => e.r === m.r && e.c === m.c)) moves.push(m);
        });
    });
    return moves.filter(m => {
        let target = board[m.r][m.c];
        if (target && target.owner === pieceObj.owner) {
            // 王との合体禁止
            if (pieceObj.types.some(t => t.type === 8) || target.types.some(t => t.type === 8)) return false;
            
            // 2枚超の合体禁止
            if (target.types.length >= 2) return false;
            
            // 自分の「歩」とは合体できないルール
            let movingHasFu = pieceObj.types.some(t => t.type === 1);
            let targetHasFu = target.types.some(t => t.type === 1);
            if (movingHasFu || targetHasFu) return false;
        }
        return true;
    });
}

function getRawMoves(type, isPromoted, owner, r, c) {
    let moves = [];
    let dir = (owner === 'sente') ? -1 : 1;

    if (isPromoted && [1, 2, 3, 4].includes(type)) {
        return getGoldMoves(owner, r, c);
    }

    switch(type) {
        case 1:
            addStep(moves, r + dir, c);
            break;
        case 2:
            addRay(moves, owner, r, c, dir, 0);
            break;
        case 3:
            addStep(moves, r + dir * 2, c - 1);
            addStep(moves, r + dir * 2, c + 1);
            break;
        case 4:
            [[-1,-1],[-1,0],[-1,1],[1,-1],[1,1]].forEach(o => {
                addStep(moves, r + (owner==='sente'?o[0]:-o[0]), c + o[1]);
            });
            break;
        case 5:
            return getGoldMoves(owner, r, c);
        case 6:
            [[-1,-1],[-1,1],[1,-1],[1,1]].forEach(o => addRay(moves, owner, r, c, o[0], o[1]));
            if (isPromoted) getGoldMoves(owner, r, c).forEach(m => moves.push(m));
            break;
        case 7:
            [[-1,0],[1,0],[0,-1],[0,1]].forEach(o => addRay(moves, owner, r, c, o[0], o[1]));
            if (isPromoted) [[-1,-1],[-1,1],[1,-1],[1,1]].forEach(o => addStep(moves, r+o[0], c+o[1]));
            break;
        case 8:
            [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]].forEach(o => addStep(moves, r+o[0], c+o[1]));
            break;
    }
    return moves;
}

function getGoldMoves(owner, r, c) {
    let moves = [];
    let dir = (owner === 'sente') ? -1 : 1;
    let offsets = [{r:dir, c:-1}, {r:dir, c:0}, {r:dir, c:1}, {r:0, c:-1}, {r:0, c:1}, {r:-dir, c:0}];
    offsets.forEach(o => addStep(moves, r + o.r, c + o.c));
    return moves;
}

function addStep(moves, r, c) {
    if (r >= 0 && r < 9 && c >= 0 && c < 9) moves.push({r, c});
}

function addRay(moves, owner, r, c, dr, dc) {
    let nr = r + dr, nc = c + dc;
    while (nr >= 0 && nr < 9 && nc >= 0 && nc < 9) {
        moves.push({r: nr, c: nc});
        if (board[nr][nc]) break;
        nr += dr; nc += dc;
    }
}

function getDropCoords(pieceType) {
    let moves = [];
    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            if (!board[r][c]) {
                if (pieceType === 1 && hasNifu(c, turn)) continue;
                moves.push({r, c});
            }
        }
    }
    return moves;
}

function render() {
    const container = document.getElementById('board-container');
    container.innerHTML = '';

    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            if (selectedCoord && selectedCoord.r === r && selectedCoord.c === c) cell.classList.add('selected');
            if (movableCoords.some(m => m.r === r && m.c === c)) cell.classList.add('movable');

            const piece = board[r][c];
            if (piece) {
                const pDiv = document.createElement('div');
                pDiv.className = `piece ${piece.owner} ${piece.types.length > 1 ? 'merged' : ''}`;
                piece.types.forEach(p => {
                    const sub = document.createElement('span');
                    sub.className = `sub-piece ${p.isPromoted ? 'promoted' : ''}`;
                    sub.textContent = p.isPromoted ? PIECE_TYPES[p.type].promoted : PIECE_TYPES[p.type].name;
                    pDiv.appendChild(sub);
                });
                cell.appendChild(pDiv);
            }
            cell.addEventListener('click', () => handleCellClick(r, c));
            container.appendChild(cell);
        }
    }

    renderHands();
    checkCheckStatus();
}

function renderHands() {
    ['sente', 'gote'].forEach(player => {
        const handDiv = document.getElementById(`${player}-hand-pieces`);
        handDiv.innerHTML = '';
        hands[player].forEach((typeId, index) => {
            const hp = document.createElement('div');
            hp.className = `hand-piece ${selectedHandIndex === index && turn === player ? 'selected' : ''}`;
            hp.textContent = PIECE_TYPES[typeId].name;
            hp.addEventListener('click', (e) => {
                e.stopPropagation();
                if (turn === player) handleHandClick(index);
            });
            handDiv.appendChild(hp);
        });
    });
}

function checkCheckStatus() {
    let statusText = `${turn === 'sente' ? '先手' : '後手'}の番です`;
    let opponent = turn === 'sente' ? 'gote' : 'sente';
    
    let isChecking = false;
    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            let p = board[r][c];
            if (p && p.owner === turn) {
                let moves = getMovableCoords(r, c, p);
                if (moves.some(m => {
                    let target = board[m.r][m.c];
                    return target && target.owner === opponent && target.types.some(t => t.type === 8);
                })) {
                    isChecking = true;
                    break;
                }
            }
        }
    }
    if (isChecking) {
        statusText = `⚠️ ${opponent === 'sente' ? '先手' : '後手'}に王手がかかっています！`;
    }
    document.getElementById('status').textContent = statusText;
}

function handleCellClick(r, c) {
    if (selectedHandIndex !== null && movableCoords.some(m => m.r === r && m.c === c)) {
        let pieceType = hands[turn][selectedHandIndex];
        if (pieceType === 1 && hasNifu(c, turn)) {
            alert("同じ筋に歩を2枚打つ「二歩」は禁止されています！");
            return;
        }

        hands[turn].splice(selectedHandIndex, 1);
        board[r][c] = createPieceObj([pieceType], turn);
        playPachiSound();
        resetSelection();
        switchTurn();
        return;
    }

    if (selectedCoord && movableCoords.some(m => m.r === r && m.c === c)) {
        executeMove(selectedCoord.r, selectedCoord.c, r, c);
        resetSelection();
        switchTurn();
        return;
    }

    let clicked = board[r][c];
    if (clicked && clicked.owner === turn) {
        selectedHandIndex = null;
        selectedCoord = {r, c};
        movableCoords = getMovableCoords(r, c, clicked);
        render();
        return;
    }

    resetSelection();
    render();
}

function handleHandClick(index) {
    selectedCoord = null;
    if (selectedHandIndex === index) {
        resetSelection();
    } else {
        selectedHandIndex = index;
        let pieceType = hands[turn][index];
        movableCoords = getDropCoords(pieceType);
    }
    render();
}

function resetSelection() {
    selectedCoord = null;
    selectedHandIndex = null;
    movableCoords = [];
}

function executeMove(fromR, fromC, toR, toC) {
    let moving = board[fromR][fromC];
    let target = board[toR][toC];

    if (target) {
        if (target.owner === moving.owner) {
            target.types.push(...moving.types);
            board[fromR][fromC] = null;
        } else {
            if (target.types.some(t => t.type === 8)) {
                playPachiSound();
                render();
                setTimeout(() => {
                    alert(`${turn === 'sente' ? '先手' : '後手'}の勝利です！（王将を捕らえました）`);
                    initBoard();
                    turn = 'sente';
                    render();
                }, 100);
                return;
            }

            target.types.forEach(p => {
                if (p.type !== 8) {
                    hands[turn].push(p.type);
                }
            });
            board[toR][toC] = moving;
            board[fromR][fromC] = null;
            checkPromotion(board[toR][toC], fromR, toR);
        }
    } else {
        board[toR][toC] = moving;
        board[fromR][fromC] = null;
        checkPromotion(board[toR][toC], fromR, toR);
    }
    playPachiSound();
}

function checkPromotion(pieceObj, fromR, toR) {
    let enemyZone = (pieceObj.owner === 'sente') ? [0, 1, 2] : [6, 7, 8];
    let isEnemyArea = enemyZone.includes(fromR) || enemyZone.includes(toR);

    if (isEnemyArea) {
        pieceObj.types.exportEach = pieceObj.types.forEach(p => {
            if (!p.isPromoted && PIECE_TYPES[p.type].promoted) {
                if (confirm(`${PIECE_TYPES[p.type].name} を 成りますか？`)) {
                    p.isPromoted = true;
                }
            }
        });
    }
}

function switchTurn() {
    turn = (turn === 'sente') ? 'gote' : 'sente';
    render();
}

initBoard();
render();
