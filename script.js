const SCRIPT_VERSION = 'v3.30';

let audioCtx = null;

function playPachiSound() {
    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }

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

const PIECE_DISPLAY_NAMES = {
    1: { name: '歩', promoted: 'と' },
    2: { name: '香', promoted: '杏' },
    3: { name: '桂', promoted: '圭' },
    4: { name: '銀', promoted: '全' },
    5: { name: '金', promoted: null },
    6: { name: '角', promoted: '馬' },
    7: { name: '飛', promoted: '竜' },
    8: { name: '王', promoted: null }
};

const PIECE_VALUES = {
    1: 1, 2: 3, 3: 3, 4: 4, 5: 5, 6: 9, 7: 12, 8: 1500
};

const ROW_NAMES = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];

let board = Array(9).fill(null).map(() => Array(9).fill(null));
let hands = { sente: [], gote: [] };
let gameLogs = [];

let turn = 'sente';
let gameMode = 'cpu';
let cpuLevel = 2;
let selectedCoord = null;
let selectedHandIndex = null;
let movableCoords = [];
let isCpuThinking = false;

function updateVersionBadge() {
    const jsVerSpan = document.getElementById('js-version');
    if (jsVerSpan) {
        jsVerSpan.textContent = SCRIPT_VERSION;
    }
}

function addGameLog(message) {
    gameLogs.unshift(message);
    if (gameLogs.length > 30) gameLogs.pop();
    renderLogs();
}

function renderLogs() {
    const container = document.getElementById('game-log-container');
    if (!container) return;
    container.innerHTML = '';
    gameLogs.forEach(log => {
        const item = document.createElement('div');
        item.className = 'log-item';
        item.textContent = log;
        container.appendChild(item);
    });
}

function getPieceNamesStr(pieceObj) {
    return pieceObj.types.map(t => {
        let n = t.isPromoted ? PIECE_DISPLAY_NAMES[t.type].promoted : PIECE_DISPLAY_NAMES[t.type].name;
        return n;
    }).join('+');
}

function openModeModal() {
    document.getElementById('mode-modal').style.display = 'flex';
    document.getElementById('rule-modal').style.display = 'none';
}

function openRuleModalFromModal() {
    document.getElementById('mode-modal').style.display = 'none';
    document.getElementById('rule-modal').style.display = 'flex';
}

function closeRuleModal() {
    document.getElementById('rule-modal').style.display = 'none';
    document.getElementById('mode-modal').style.display = 'flex';
}

function setGameMode(mode, level) {
    playPachiSound();
    gameMode = mode;
    cpuLevel = level;
    document.getElementById('mode-modal').style.display = 'none';

    const goteName = document.getElementById('gote-name');
    if (goteName) {
        if (gameMode === 'cpu') {
            let lvlName = level === 1 ? '初級' : (level === 2 ? '中級' : '上級・強');
            goteName.textContent = `後手 (CPU:${lvlName})`;
        } else {
            goteName.textContent = '後手 (プレイヤー)';
        }
    }
    initBoard();
    render();
}

function initBoard() {
    board = Array(9).fill(null).map(() => Array(9).fill(null));
    hands = { sente: [], gote: [] };
    gameLogs = [];

    const setupLine = [2, 3, 4, 5, 8, 5, 4, 3, 2];

    for (let c = 0; c < 9; c++) board[0][c] = createPieceObj([setupLine[c]], 'gote');
    board[1][1] = createPieceObj([7], 'gote');
    board[1][7] = createPieceObj([6], 'gote');
    for (let c = 0; c < 9; c++) board[2][c] = createPieceObj([1], 'gote');

    for (let c = 0; c < 9; c++) board[6][c] = createPieceObj([1], 'sente');
    board[7][1] = createPieceObj([6], 'sente');
    board[7][7] = createPieceObj([7], 'sente');
    for (let c = 0; c < 9; c++) board[8][c] = createPieceObj([setupLine[c]], 'sente');

    turn = 'sente';
    resetSelection();
    updateVersionBadge();
    addGameLog("対局を開始しました。");
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
        if (target) {
            if (target.owner === pieceObj.owner) {
                if (pieceObj.types.some(t => t.type === 8) || target.types.some(t => t.type === 8)) return false;
                if (target.types.length + pieceObj.types.length > 4) return false;
                
                let movingHasFu = pieceObj.types.some(t => t.type === 1);
                let targetHasFu = target.types.some(t => t.type === 1);
                if (movingHasFu || targetHasFu) return false;
            }
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

function findKingCoord(owner) {
    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            let p = board[r][c];
            if (p && p.owner === owner && p.types.some(t => t.type === 8)) {
                return {r, c};
            }
        }
    }
    return null;
}

function isSquareUnderAttack(targetR, targetC, attackerColor) {
    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            let p = board[r][c];
            if (p && p.owner === attackerColor) {
                let moves = getMovableCoords(r, c, p);
                if (moves.some(m => m.r === targetR && m.c === targetC)) {
                    return true;
                }
            }
        }
    }
    return false;
}

function render() {
    const container = document.getElementById('board-container');
    if (!container) return;
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
                
                const innerDiv = document.createElement('div');
                innerDiv.className = 'piece-content-inner';

                if (piece.types.length > 1) {
                    const gridDiv = document.createElement('div');
                    gridDiv.className = 'piece-grid';
                    piece.types.forEach(p => {
                        const sub = document.createElement('span');
                        sub.className = `sub-piece ${p.isPromoted ? 'promoted' : ''}`;
                        sub.textContent = p.isPromoted ? PIECE_DISPLAY_NAMES[p.type].promoted : PIECE_DISPLAY_NAMES[p.type].name;
                        gridDiv.appendChild(sub);
                    });
                    innerDiv.appendChild(gridDiv);
                } else {
                    const p = piece.types[0];
                    const sub = document.createElement('span');
                    sub.className = `sub-piece single-piece-text ${p.isPromoted ? 'promoted' : ''}`;
                    sub.textContent = p.isPromoted ? PIECE_DISPLAY_NAMES[p.type].promoted : PIECE_DISPLAY_NAMES[p.type].name;
                    innerDiv.appendChild(sub);
                }
                pDiv.appendChild(innerDiv);
                cell.appendChild(pDiv);
            }
            cell.addEventListener('click', () => handleCellClick(r, c));
            container.appendChild(cell);
        }
    }

    renderHands();
    updateHUD();
    renderLogs();
    updateVersionBadge();
}

function renderHands() {
    ['sente', 'gote'].forEach(player => {
        const handDiv = document.getElementById(`${player}-hand-pieces`);
        if (!handDiv) return;
        handDiv.innerHTML = '';
        hands[player].forEach((typeId, index) => {
            const hp = document.createElement('div');
            hp.className = `hand-piece ${selectedHandIndex === index && turn === player ? 'selected' : ''}`;
            hp.textContent = PIECE_DISPLAY_NAMES[typeId].name;
            hp.addEventListener('click', (e) => {
                e.stopPropagation();
                if (turn === player && !(gameMode === 'cpu' && player === 'gote' && isCpuThinking)) {
                    handleHandClick(index);
                }
            });
            handDiv.appendChild(hp);
        });
    });
}

function updateHUD() {
    const senteHud = document.getElementById('sente-hud');
    const goteHud = document.getElementById('gote-hud');
    
    if (senteHud && goteHud) {
        senteHud.classList.remove('active');
        goteHud.classList.remove('active');
        
        if (turn === 'sente') {
            senteHud.classList.add('active');
        } else {
            goteHud.classList.add('active');
        }
    }
}

function handleCellClick(r, c) {
    if (gameMode === 'cpu' && turn === 'gote' && isCpuThinking) return;

    if (selectedHandIndex !== null && movableCoords.some(m => m.r === r && m.c === c)) {
        let pieceType = hands[turn][selectedHandIndex];
        if (pieceType === 1 && hasNifu(c, turn)) {
            alert("同じ筋に歩を2枚打つ「二歩」は禁止されています！");
            return;
        }

        hands[turn].splice(selectedHandIndex, 1);
        board[r][c] = createPieceObj([pieceType], turn);
        
        let pName = PIECE_DISPLAY_NAMES[pieceType].name;
        let posStr = `${9 - c}${ROW_NAMES[r]}`;
        let playerStr = turn === 'sente' ? '先手' : '後手';
        addGameLog(`${playerStr}: ${pName}を ${posStr} に打つ`);

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
    let playerStr = turn === 'sente' ? '先手' : '後手';
    let fromStr = `${9 - fromC}${ROW_NAMES[fromR]}`;
    let toStr = `${9 - toC}${ROW_NAMES[toR]}`;
    let movingName = getPieceNamesStr(moving);

    if (target) {
        if (target.owner === moving.owner) {
            if (target.types.length + moving.types.length > 4) {
                alert("駒は最大4つまでしか重ねられません！");
                return;
            }
            let targetNameBefore = getPieceNamesStr(target);
            target.types.push(...moving.types);
            let targetNameAfter = getPieceNamesStr(target);
            board[fromR][fromC] = null;
            
            addGameLog(`${playerStr}: ${movingName} が ${fromStr} から ${toStr} へ移動し自分の [${targetNameBefore}] と合体 (${targetNameAfter})`);
        } else {
            if (target.types.some(t => t.type === 8)) {
                addGameLog(`${playerStr}: 王を捕獲！`);
                playPachiSound();
                render();
                setTimeout(() => {
                    alert(`${turn === 'sente' ? '先手' : '後手'}の勝利です！（王将を捕らえました）`);
                    initBoard();
                    openModeModal();
                    render();
                }, 100);
                return;
            }

            target.types.forEach(p => {
                hands[turn].push(p.type);
            });

            let targetNameCaptured = getPieceNamesStr(target);
            board[toR][toC] = moving;
            board[fromR][fromC] = null;
            checkPromotion(board[toR][toC], fromR, toR, turn);

            addGameLog(`${playerStr}: ${movingName} が ${fromStr} から ${toStr} へ移動し、相手の [${targetNameCaptured}] を取る`);
        }
    } else {
        board[toR][toC] = moving;
        board[fromR][fromC] = null;
        checkPromotion(board[toR][toC], fromR, toR, turn);
        addGameLog(`${playerStr}: ${movingName} が ${fromStr} から ${toStr} へ移動`);
    }
    playPachiSound();
}

function checkPromotion(pieceObj, fromR, toR, playerTurn) {
    let enemyZone = (playerTurn === 'sente') ? [0, 1, 2] : [6, 7, 8];
    let isEnemyArea = enemyZone.includes(fromR) || enemyZone.includes(toR);

    if (isEnemyArea) {
        if (playerTurn === 'sente' || gameMode === 'pvp') {
            pieceObj.types.forEach(p => {
                if (!p.isPromoted && PIECE_DISPLAY_NAMES[p.type].promoted) {
                    if (confirm(`${PIECE_DISPLAY_NAMES[p.type].name} を 成りますか？`)) {
                        p.isPromoted = true;
                        addGameLog(`${playerTurn === 'sente' ? '先手' : '後手'}: ${PIECE_DISPLAY_NAMES[p.type].name} を成りました`);
                    }
                }
            });
        } else {
            pieceObj.types.forEach(p => {
                if (!p.isPromoted && PIECE_DISPLAY_NAMES[p.type].promoted) {
                    p.isPromoted = true;
                    addGameLog(`後手(CPU): ${PIECE_DISPLAY_NAMES[p.type].name} を成りました`);
                }
            });
        }
    }
}

function switchTurn() {
    turn = (turn === 'sente') ? 'gote' : 'sente';
    render();

    if (gameMode === 'cpu' && turn === 'gote') {
        isCpuThinking = true;
        setTimeout(runCpuTurn, 600);
    }
}

function runCpuTurn() {
    let allMoves = [];

    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            let p = board[r][c];
            if (p && p.owner === 'gote') {
                let moves = getMovableCoords(r, c, p);
                moves.forEach(m => {
                    allMoves.push({ type: 'board', fromR: r, fromC: c, toR: m.r, toC: m.c });
                });
            }
        }
    }

    hands['gote'].forEach((pieceType, hIndex) => {
        let dropCoords = getDropCoords(pieceType);
        dropCoords.forEach(d => {
            allMoves.push({ type: 'drop', handIndex: hIndex, pieceType: pieceType, toR: d.r, toC: d.c });
        });
    });

    if (allMoves.length === 0) {
        addGameLog("後手（CPU）の指せる手がないため先手の勝利です。");
        alert("後手（CPU）の指せる手がありません。先手の勝利です！");
        isCpuThinking = false;
        openModeModal();
        return;
    }

    let bestMove;

    if (cpuLevel === 1) {
        bestMove = allMoves[Math.floor(Math.random() * allMoves.length)];
    } else {
        let goteKing = findKingCoord('gote');
        let isKingInCheck = goteKing ? isSquareUnderAttack(goteKing.r, goteKing.c, 'sente') : false;

        let scoredMoves = allMoves.map(move => {
            let score = Math.random() * (cpuLevel === 3 ? 1 : 3);

            let movingPiece = null;
            let targetPiece = null;

            if (move.type === 'board') {
                movingPiece = board[move.fromR][move.fromC];
                targetPiece = board[move.toR][move.toC];
                
                board[move.fromR][move.fromC] = null;

                if (targetPiece) {
                    if (targetPiece.owner === 'gote') {
                        let simulatedTypes = [...targetPiece.types, ...movingPiece.types];
                        board[move.toR][move.toC] = { types: simulatedTypes, owner: 'gote' };
                    } else {
                        board[move.toR][move.toC] = movingPiece;
                    }
                } else {
                    board[move.toR][move.toC] = movingPiece;
                }
            } else if (move.type === 'drop') {
                targetPiece = board[move.toR][move.toC];
                board[move.toR][move.toC] = createPieceObj([move.pieceType], 'gote');
            }

            let newGoteKing = findKingCoord('gote');
            let willBeInCheck = newGoteKing ? isSquareUnderAttack(newGoteKing.r, newGoteKing.c, 'sente') : false;

            if (willBeInCheck) {
                score -= 10000;
            } else if (isKingInCheck) {
                score += 5000;
            }

            let senteKing = findKingCoord('sente');
            if (senteKing) {
                if (targetPiece && targetPiece.owner === 'sente' && targetPiece.types.some(t => t.type === 8)) {
                    score += 100000;
                } else if (isSquareUnderAttack(senteKing.r, senteKing.c, 'gote')) {
                    score += 2500;
                }
            }

            if (move.type === 'board') {
                if (targetPiece) {
                    if (targetPiece.owner === 'sente') {
                        score += 500;
                    } else {
                        let stackCountAfter = targetPiece.types.length + movingPiece.types.length;
                        score += stackCountAfter * 25;
                    }
                }

                if (cpuLevel === 3) {
                    score += move.toR * 8;
                    if (senteKing) {
                        let dist = Math.abs(move.toR - senteKing.r) + Math.abs(move.toC - senteKing.c);
                        if (dist <= 2) score += (3 - dist) * 50;
                    }
                } else {
                    score += move.toR;
                }

            } else if (move.type === 'drop') {
                score += PIECE_VALUES[move.pieceType] * 12;
                if (move.toR >= 5) score += 30;
            }

            if (move.type === 'board') {
                board[move.fromR][move.fromC] = movingPiece;
                board[move.toR][move.toC] = targetPiece;
            } else if (move.type === 'drop') {
                board[move.toR][move.toC] = targetPiece;
            }

            return { move, score };
        });

        scoredMoves.sort((a, b) => b.score - a.score);
        bestMove = scoredMoves[0].move;
    }

    if (bestMove.type === 'board') {
        executeMove(bestMove.fromR, bestMove.fromC, bestMove.toR, bestMove.toC);
    } else if (bestMove.type === 'drop') {
        hands['gote'].splice(bestMove.handIndex, 1);
        board[bestMove.toR][bestMove.toC] = createPieceObj([bestMove.pieceType], 'gote');
        let pName = PIECE_DISPLAY_NAMES[bestMove.pieceType].name;
        let posStr = `${9 - bestMove.toC}${ROW_NAMES[bestMove.toR]}`;
        addGameLog(`後手(CPU): ${pName}を ${posStr} に打つ`);
        playPachiSound();
    }

    isCpuThinking = false;
    turn = 'sente';
    render();
}

initBoard();
render();
