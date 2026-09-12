function competitionRanks(items, keyFn) {
    let previousKey;
    let previousRank = 0;
    return items.map((item, index) => {
        const key = String(keyFn(item));
        const rank = index > 0 && key === previousKey ? previousRank : index + 1;
        previousKey = key;
        previousRank = rank;
        return { ...item, rank };
    });
}

function rankLines(items, valueFn) {
    const counts = new Map();
    items.forEach(item => counts.set(item.rank, (counts.get(item.rank) || 0) + 1));
    return items.map(item => `${counts.get(item.rank) > 1 ? '공동 ' : ''}${item.rank}위: ${item.name} (${valueFn(item)})`).join('<br>');
}

module.exports = { competitionRanks, rankLines };
