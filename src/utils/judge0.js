
const LANGUAGE_MAP = {
    "cpp": 54,
    "c": 50,
    "java": 62,
    "python": 71,
    "javascript": 63,

}

const getLanguageId = (language) => {
    const id = LANGUAGE_MAP[language.toLowerCase()];
    if (!id) {
        throw new Error(`Unsupported Language: ${language}`);
    }

    return id;
}





module.exports = { getLanguageId };