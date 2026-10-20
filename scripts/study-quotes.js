/*
 * MYNT study quotes: classical Chinese originals and well-attributed lines
 * from writers and thinkers. Each entry: zh (display), author, work,
 * optional orig (original language) and en (English, used for non-zh locales).
 */
const MYNT_STUDY_QUOTES = [
    {
        "zh": "學而時習之，不亦說乎？",
        "author": "孔子",
        "work": "論語·學而"
    },
    {
        "zh": "學而不思則罔，思而不學則殆。",
        "author": "孔子",
        "work": "論語·為政"
    },
    {
        "zh": "溫故而知新，可以為師矣。",
        "author": "孔子",
        "work": "論語·為政"
    },
    {
        "zh": "知之為知之，不知為不知，是知也。",
        "author": "孔子",
        "work": "論語·為政"
    },
    {
        "zh": "三人行，必有我師焉。",
        "author": "孔子",
        "work": "論語·述而"
    },
    {
        "zh": "士不可以不弘毅，任重而道遠。",
        "author": "曾子",
        "work": "論語·泰伯"
    },
    {
        "zh": "歲寒，然後知松柏之後彫也。",
        "author": "孔子",
        "work": "論語·子罕"
    },
    {
        "zh": "譬如為山，未成一簣，止，吾止也。",
        "author": "孔子",
        "work": "論語·子罕"
    },
    {
        "zh": "知者不惑，仁者不憂，勇者不懼。",
        "author": "孔子",
        "work": "論語·子罕"
    },
    {
        "zh": "逝者如斯夫，不舍晝夜。",
        "author": "孔子",
        "work": "論語·子罕"
    },
    {
        "zh": "君子求諸己，小人求諸人。",
        "author": "孔子",
        "work": "論語·衛靈公"
    },
    {
        "zh": "工欲善其事，必先利其器。",
        "author": "孔子",
        "work": "論語·衛靈公"
    },
    {
        "zh": "博學而篤志，切問而近思，仁在其中矣。",
        "author": "子夏",
        "work": "論語·子張"
    },
    {
        "zh": "吾日三省吾身。",
        "author": "曾子",
        "work": "論語·學而"
    },
    {
        "zh": "見賢思齊焉，見不賢而內自省也。",
        "author": "孔子",
        "work": "論語·里仁"
    },
    {
        "zh": "朝聞道，夕死可矣。",
        "author": "孔子",
        "work": "論語·里仁"
    },
    {
        "zh": "知之者不如好之者，好之者不如樂之者。",
        "author": "孔子",
        "work": "論語·雍也"
    },
    {
        "zh": "發憤忘食，樂以忘憂，不知老之將至云爾。",
        "author": "孔子",
        "work": "論語·述而"
    },
    {
        "zh": "默而識之，學而不厭，誨人不倦。",
        "author": "孔子",
        "work": "論語·述而"
    },
    {
        "zh": "君子坦蕩蕩，小人長戚戚。",
        "author": "孔子",
        "work": "論語·述而"
    },
    {
        "zh": "欲速則不達，見小利則大事不成。",
        "author": "孔子",
        "work": "論語·子路"
    },
    {
        "zh": "故天將降大任於是人也，必先苦其心志，勞其筋骨。",
        "author": "孟子",
        "work": "孟子·告子下"
    },
    {
        "zh": "生於憂患，而死於安樂。",
        "author": "孟子",
        "work": "孟子·告子下"
    },
    {
        "zh": "人恆過，然後能改。",
        "author": "孟子",
        "work": "孟子·告子下"
    },
    {
        "zh": "富貴不能淫，貧賤不能移，威武不能屈。",
        "author": "孟子",
        "work": "孟子·滕文公下"
    },
    {
        "zh": "有為者辟若掘井，掘井九軔而不及泉，猶為棄井也。",
        "author": "孟子",
        "work": "孟子·盡心上"
    },
    {
        "zh": "盡信書，則不如無書。",
        "author": "孟子",
        "work": "孟子·盡心下"
    },
    {
        "zh": "自反而縮，雖千萬人，吾往矣。",
        "author": "孟子",
        "work": "孟子·公孫丑上"
    },
    {
        "zh": "天時不如地利，地利不如人和。",
        "author": "孟子",
        "work": "孟子·公孫丑下"
    },
    {
        "zh": "學不可以已。",
        "author": "荀子",
        "work": "荀子·勸學"
    },
    {
        "zh": "青，取之於藍，而青於藍。",
        "author": "荀子",
        "work": "荀子·勸學"
    },
    {
        "zh": "不積跬步，無以至千里；不積小流，無以成江海。",
        "author": "荀子",
        "work": "荀子·勸學"
    },
    {
        "zh": "騏驥一躍，不能十步；駑馬十駕，功在不舍。",
        "author": "荀子",
        "work": "荀子·勸學"
    },
    {
        "zh": "鍥而舍之，朽木不折；鍥而不舍，金石可鏤。",
        "author": "荀子",
        "work": "荀子·勸學"
    },
    {
        "zh": "君子博學而日參省乎己，則知明而行無過矣。",
        "author": "荀子",
        "work": "荀子·勸學"
    },
    {
        "zh": "蓬生麻中，不扶而直。",
        "author": "荀子",
        "work": "荀子·勸學"
    },
    {
        "zh": "道雖邇，不行不至；事雖小，不為不成。",
        "author": "荀子",
        "work": "荀子·修身"
    },
    {
        "zh": "千里之行，始於足下。",
        "author": "老子",
        "work": "道德經·第六十四章"
    },
    {
        "zh": "合抱之木，生於毫末；九層之臺，起於累土。",
        "author": "老子",
        "work": "道德經·第六十四章"
    },
    {
        "zh": "知人者智，自知者明；勝人者有力，自勝者強。",
        "author": "老子",
        "work": "道德經·第三十三章"
    },
    {
        "zh": "天下難事，必作於易；天下大事，必作於細。",
        "author": "老子",
        "work": "道德經·第六十三章"
    },
    {
        "zh": "吾生也有涯，而知也無涯。",
        "author": "莊子",
        "work": "莊子·養生主"
    },
    {
        "zh": "且夫水之積也不厚，則其負大舟也無力。",
        "author": "莊子",
        "work": "莊子·逍遙遊"
    },
    {
        "zh": "志不強者智不達。",
        "author": "墨子",
        "work": "墨子·修身"
    },
    {
        "zh": "博學之，審問之，慎思之，明辨之，篤行之。",
        "author": "子思",
        "work": "中庸"
    },
    {
        "zh": "人一能之己百之，人十能之己千之。",
        "author": "子思",
        "work": "中庸"
    },
    {
        "zh": "苟日新，日日新，又日新。",
        "author": "曾子",
        "work": "大學"
    },
    {
        "zh": "知止而後有定，定而後能靜，靜而後能安，安而後能慮，慮而後能得。",
        "author": "曾子",
        "work": "大學"
    },
    {
        "zh": "玉不琢，不成器；人不學，不知道。",
        "author": "戴聖 編",
        "work": "禮記·學記"
    },
    {
        "zh": "學然後知不足，教然後知困。",
        "author": "戴聖 編",
        "work": "禮記·學記"
    },
    {
        "zh": "天行健，君子以自強不息。",
        "author": "佚名",
        "work": "周易·乾·象傳"
    },
    {
        "zh": "少壯不努力，老大徒傷悲。",
        "author": "漢樂府",
        "work": "長歌行"
    },
    {
        "zh": "非淡泊無以明志，非寧靜無以致遠。",
        "author": "諸葛亮",
        "work": "誡子書"
    },
    {
        "zh": "夫學須靜也，才須學也；非學無以廣才，非志無以成學。",
        "author": "諸葛亮",
        "work": "誡子書"
    },
    {
        "zh": "盛年不重來，一日難再晨。及時當勉勵，歲月不待人。",
        "author": "陶淵明",
        "work": "雜詩"
    },
    {
        "zh": "路漫漫其修遠兮，吾將上下而求索。",
        "author": "屈原",
        "work": "離騷"
    },
    {
        "zh": "亦余心之所善兮，雖九死其猶未悔。",
        "author": "屈原",
        "work": "離騷"
    },
    {
        "zh": "長風破浪會有時，直掛雲帆濟滄海。",
        "author": "李白",
        "work": "行路難"
    },
    {
        "zh": "天生我材必有用。",
        "author": "李白",
        "work": "將進酒"
    },
    {
        "zh": "會當凌絕頂，一覽眾山小。",
        "author": "杜甫",
        "work": "望嶽"
    },
    {
        "zh": "讀書破萬卷，下筆如有神。",
        "author": "杜甫",
        "work": "奉贈韋左丞丈二十二韻"
    },
    {
        "zh": "欲窮千里目，更上一層樓。",
        "author": "王之渙",
        "work": "登鸛雀樓"
    },
    {
        "zh": "春風得意馬蹄疾，一日看盡長安花。",
        "author": "孟郊",
        "work": "登科後"
    },
    {
        "zh": "沉舟側畔千帆過，病樹前頭萬木春。",
        "author": "劉禹錫",
        "work": "酬樂天揚州初逢席上見贈"
    },
    {
        "zh": "千淘萬漉雖辛苦，吹盡狂沙始到金。",
        "author": "劉禹錫",
        "work": "浪淘沙"
    },
    {
        "zh": "業精於勤，荒於嬉；行成於思，毀於隨。",
        "author": "韓愈",
        "work": "進學解"
    },
    {
        "zh": "焚膏油以繼晷，恆兀兀以窮年。",
        "author": "韓愈",
        "work": "進學解"
    },
    {
        "zh": "師者，所以傳道受業解惑也。",
        "author": "韓愈",
        "work": "師說"
    },
    {
        "zh": "古之立大事者，不惟有超世之才，亦必有堅忍不拔之志。",
        "author": "蘇軾",
        "work": "晁錯論"
    },
    {
        "zh": "博觀而約取，厚積而薄發。",
        "author": "蘇軾",
        "work": "稼說送張琥"
    },
    {
        "zh": "舊書不厭百回讀，熟讀深思子自知。",
        "author": "蘇軾",
        "work": "送安惇秀才失解西歸"
    },
    {
        "zh": "莫聽穿林打葉聲，何妨吟嘯且徐行。",
        "author": "蘇軾",
        "work": "定風波"
    },
    {
        "zh": "竹杖芒鞋輕勝馬，誰怕？一蓑煙雨任平生。",
        "author": "蘇軾",
        "work": "定風波"
    },
    {
        "zh": "回首向來蕭瑟處，歸去，也無風雨也無晴。",
        "author": "蘇軾",
        "work": "定風波"
    },
    {
        "zh": "不識廬山真面目，只緣身在此山中。",
        "author": "蘇軾",
        "work": "題西林壁"
    },
    {
        "zh": "世之奇偉、瑰怪，非常之觀，常在於險遠，而人之所罕至焉，故非有志者不能至也。",
        "author": "王安石",
        "work": "遊褒禪山記"
    },
    {
        "zh": "盡吾志也而不能至者，可以無悔矣。",
        "author": "王安石",
        "work": "遊褒禪山記"
    },
    {
        "zh": "先天下之憂而憂，後天下之樂而樂。",
        "author": "范仲淹",
        "work": "岳陽樓記"
    },
    {
        "zh": "紙上得來終覺淺，絕知此事要躬行。",
        "author": "陸游",
        "work": "冬夜讀書示子聿"
    },
    {
        "zh": "山重水複疑無路，柳暗花明又一村。",
        "author": "陸游",
        "work": "遊山西村"
    },
    {
        "zh": "問渠那得清如許？為有源頭活水來。",
        "author": "朱熹",
        "work": "觀書有感"
    },
    {
        "zh": "眾裡尋他千百度，驀然回首，那人卻在，燈火闌珊處。",
        "author": "辛棄疾",
        "work": "青玉案·元夕"
    },
    {
        "zh": "知是行之始，行是知之成。",
        "author": "王陽明",
        "work": "傳習錄"
    },
    {
        "zh": "人須在事上磨，方立得住。",
        "author": "王陽明",
        "work": "傳習錄"
    },
    {
        "zh": "其實地上本沒有路，走的人多了，也便成了路。",
        "author": "魯迅",
        "work": "故鄉"
    },
    {
        "zh": "有一分熱，發一分光。",
        "author": "魯迅",
        "work": "熱風·隨感錄四十一"
    },
    {
        "zh": "凡不能毀滅我的，必使我更強大。",
        "author": "尼采",
        "work": "偶像的黃昏",
        "orig": "Was mich nicht umbringt, macht mich stärker.",
        "en": "What does not kill me makes me stronger.",
        "authorEn": "Friedrich Nietzsche",
        "workEn": "Twilight of the Idols"
    },
    {
        "zh": "知道自己為何而活的人，幾乎能忍受任何一種生活。",
        "author": "尼采",
        "work": "偶像的黃昏",
        "orig": "Hat man sein warum? des Lebens, so verträgt man sich fast mit jedem wie?",
        "en": "He who has a why to live can bear almost any how.",
        "authorEn": "Friedrich Nietzsche",
        "workEn": "Twilight of the Idols"
    },
    {
        "zh": "人必須在自身之中仍懷有混沌，才能誕生一顆舞動的星星。",
        "author": "尼采",
        "work": "查拉圖斯特拉如是說",
        "orig": "Man muss noch Chaos in sich haben, um einen tanzenden Stern gebären zu können.",
        "en": "One must still have chaos in oneself to give birth to a dancing star.",
        "authorEn": "Friedrich Nietzsche",
        "workEn": "Thus Spoke Zarathustra"
    },
    {
        "zh": "你應當成為你自己。",
        "author": "尼采",
        "work": "快樂的科學",
        "orig": "Du sollst der werden, der du bist.",
        "en": "You shall become the person you are.",
        "authorEn": "Friedrich Nietzsche",
        "workEn": "The Gay Science"
    },
    {
        "zh": "凡是不斷努力奮鬥的人，我們都能將他救贖。",
        "author": "歌德",
        "work": "浮士德",
        "orig": "Wer immer strebend sich bemüht, den können wir erlösen.",
        "en": "Whoever strives with all his might, him we can redeem.",
        "authorEn": "Johann Wolfgang von Goethe",
        "workEn": "Faust"
    },
    {
        "zh": "人只要奮鬥，就難免犯錯。",
        "author": "歌德",
        "work": "浮士德",
        "orig": "Es irrt der Mensch, solang er strebt.",
        "en": "Man errs as long as he strives.",
        "authorEn": "Johann Wolfgang von Goethe",
        "workEn": "Faust"
    },
    {
        "zh": "光知道是不夠的，還必須應用；光有意願是不夠的，還必須行動。",
        "author": "歌德",
        "work": "威廉·麥斯特的漫遊年代",
        "orig": "Es ist nicht genug zu wissen, man muß auch anwenden; es ist nicht genug zu wollen, man muß auch tun.",
        "en": "Knowing is not enough; we must apply. Willing is not enough; we must do.",
        "authorEn": "Johann Wolfgang von Goethe",
        "workEn": "Wilhelm Meister's Journeyman Years"
    },
    {
        "zh": "不是因為事情困難我們才不敢，而是因為我們不敢，事情才變得困難。",
        "author": "塞內卡",
        "work": "道德書簡",
        "orig": "Non quia difficilia sunt non audemus, sed quia non audemus, difficilia sunt.",
        "en": "It is not because things are difficult that we do not dare; it is because we do not dare that they are difficult.",
        "authorEn": "Seneca",
        "workEn": "Letters to Lucilius"
    },
    {
        "zh": "一切都不屬於我們，唯有時間是我們的。",
        "author": "塞內卡",
        "work": "道德書簡",
        "orig": "Omnia aliena sunt, tempus tantum nostrum est.",
        "en": "Nothing is ours except time.",
        "authorEn": "Seneca",
        "workEn": "Letters to Lucilius"
    },
    {
        "zh": "在我們拖延之際，生命已飛逝而過。",
        "author": "塞內卡",
        "work": "道德書簡",
        "orig": "Dum differtur vita transcurrit.",
        "en": "While we postpone, life speeds by.",
        "authorEn": "Seneca",
        "workEn": "Letters to Lucilius"
    },
    {
        "zh": "處處都在的人，其實哪裡都不在。",
        "author": "塞內卡",
        "work": "道德書簡",
        "orig": "Nusquam est qui ubique est.",
        "en": "Everywhere means nowhere.",
        "authorEn": "Seneca",
        "workEn": "Letters to Lucilius"
    },
    {
        "zh": "我們擁有的時間並不少，只是浪費得太多。",
        "author": "塞內卡",
        "work": "論生命之短暫",
        "orig": "Non exiguum temporis habemus, sed multum perdidimus.",
        "en": "It is not that we have a short time to live, but that we waste a lot of it.",
        "authorEn": "Seneca",
        "workEn": "On the Shortness of Life"
    },
    {
        "zh": "行動的阻礙反而促成行動，擋在路上的，就成了道路。",
        "author": "馬可·奧理略",
        "work": "沉思錄",
        "orig": "The impediment to action advances action. What stands in the way becomes the way.",
        "en": "The impediment to action advances action. What stands in the way becomes the way.",
        "authorEn": "Marcus Aurelius",
        "workEn": "Meditations"
    },
    {
        "zh": "別再爭論好人應該是什麼樣子，去成為一個好人。",
        "author": "馬可·奧理略",
        "work": "沉思錄",
        "orig": "Waste no more time arguing about what a good man should be. Be one.",
        "en": "Waste no more time arguing about what a good man should be. Be one.",
        "authorEn": "Marcus Aurelius",
        "workEn": "Meditations"
    },
    {
        "zh": "若你因外物而苦惱，痛苦並非來自事物本身，而是來自你對它的判斷。",
        "author": "馬可·奧理略",
        "work": "沉思錄",
        "orig": "If you are distressed by anything external, the pain is not due to the thing itself, but to your estimate of it.",
        "en": "If you are distressed by anything external, the pain is not due to the thing itself, but to your estimate of it.",
        "authorEn": "Marcus Aurelius",
        "workEn": "Meditations"
    },
    {
        "zh": "把生命中的每一個行動，都當作最後一個來做。",
        "author": "馬可·奧理略",
        "work": "沉思錄",
        "orig": "Do every act of your life as though it were the very last act of your life.",
        "en": "Do every act of your life as though it were the very last act of your life.",
        "authorEn": "Marcus Aurelius",
        "workEn": "Meditations"
    },
    {
        "zh": "使人困擾的不是事物本身，而是人對事物的看法。",
        "author": "愛比克泰德",
        "work": "手冊",
        "orig": "Men are disturbed not by things, but by the views which they take of things.",
        "en": "Men are disturbed not by things, but by the views which they take of things.",
        "authorEn": "Epictetus",
        "workEn": "Enchiridion"
    },
    {
        "zh": "任何偉大的事物都不是突然生成的。",
        "author": "愛比克泰德",
        "work": "論說集",
        "orig": "No great thing is created suddenly.",
        "en": "No great thing is created suddenly.",
        "authorEn": "Epictetus",
        "workEn": "Discourses"
    },
    {
        "zh": "每一種習慣與能力，都靠相應的行動得以保持並增強。",
        "author": "愛比克泰德",
        "work": "論說集",
        "orig": "Every habit and faculty is preserved and increased by its corresponding actions.",
        "en": "Every habit and faculty is preserved and increased by its corresponding actions.",
        "authorEn": "Epictetus",
        "workEn": "Discourses"
    },
    {
        "zh": "除了你自己，沒有什麼能帶給你平靜。",
        "author": "愛默生",
        "work": "自立",
        "orig": "Nothing can bring you peace but yourself.",
        "en": "Nothing can bring you peace but yourself.",
        "authorEn": "Ralph Waldo Emerson",
        "workEn": "Self-Reliance"
    },
    {
        "zh": "一個人若自信地朝夢想的方向前進，便會遇見平常意想不到的成功。",
        "author": "梭羅",
        "work": "湖濱散記",
        "orig": "If one advances confidently in the direction of his dreams... he will meet with a success unexpected in common hours.",
        "en": "If one advances confidently in the direction of his dreams, he will meet with a success unexpected in common hours.",
        "authorEn": "Henry David Thoreau",
        "workEn": "Walden"
    },
    {
        "zh": "所有戰士中最強大的是這兩個：時間與耐心。",
        "author": "托爾斯泰",
        "work": "戰爭與和平",
        "orig": "The strongest of all warriors are these two — Time and Patience.",
        "en": "The strongest of all warriors are these two — Time and Patience.",
        "authorEn": "Leo Tolstoy",
        "workEn": "War and Peace"
    },
    {
        "zh": "要愛生活本身，勝過愛生活的意義。",
        "author": "杜斯妥也夫斯基",
        "work": "卡拉馬佐夫兄弟",
        "orig": "Love life more than the meaning of it.",
        "en": "Love life more than the meaning of it.",
        "authorEn": "Fyodor Dostoevsky",
        "workEn": "The Brothers Karamazov"
    },
    {
        "zh": "一本書必須是砍向我們內心冰封之海的斧頭。",
        "author": "卡夫卡",
        "work": "致奧斯卡·波拉克書信",
        "orig": "Ein Buch muss die Axt sein für das gefrorene Meer in uns.",
        "en": "A book must be the axe for the frozen sea within us.",
        "authorEn": "Franz Kafka",
        "workEn": "Letter to Oskar Pollak"
    },
    {
        "zh": "對心中一切未解之事保持耐心，試著去愛問題本身。",
        "author": "里爾克",
        "work": "給青年詩人的信",
        "orig": "Haben Sie Geduld gegen alles Ungelöste in Ihrem Herzen und versuchen Sie, die Fragen selbst liebzuhaben.",
        "en": "Be patient toward all that is unsolved in your heart and try to love the questions themselves.",
        "authorEn": "Rainer Maria Rilke",
        "workEn": "Letters to a Young Poet"
    },
    {
        "zh": "現在就去活出這些問題。",
        "author": "里爾克",
        "work": "給青年詩人的信",
        "orig": "Leben Sie jetzt die Fragen.",
        "en": "Live the questions now.",
        "authorEn": "Rainer Maria Rilke",
        "workEn": "Letters to a Young Poet"
    },
    {
        "zh": "邁向高峰的奮鬥本身，足以充實人心。我們必須想像薛西弗斯是快樂的。",
        "author": "卡繆",
        "work": "薛西弗斯的神話",
        "orig": "La lutte elle-même vers les sommets suffit à remplir un cœur d'homme. Il faut imaginer Sisyphe heureux.",
        "en": "The struggle itself toward the heights is enough to fill a man's heart. One must imagine Sisyphus happy.",
        "authorEn": "Albert Camus",
        "workEn": "The Myth of Sisyphus"
    },
    {
        "zh": "在隆冬，我終於發現，我身上有一個不可戰勝的夏天。",
        "author": "卡繆",
        "work": "重返提帕薩",
        "orig": "Au milieu de l'hiver, j'apprenais enfin qu'il y avait en moi un été invincible.",
        "en": "In the midst of winter, I found there was, within me, an invincible summer.",
        "authorEn": "Albert Camus",
        "workEn": "Return to Tipasa"
    },
    {
        "zh": "人可以被毀滅，但不能被打敗。",
        "author": "海明威",
        "work": "老人與海",
        "orig": "A man can be destroyed but not defeated.",
        "en": "A man can be destroyed but not defeated.",
        "authorEn": "Ernest Hemingway",
        "workEn": "The Old Man and the Sea"
    },
    {
        "zh": "人只不過是一根蘆葦，是自然界最脆弱的東西，但他是一根能思想的蘆葦。",
        "author": "帕斯卡",
        "work": "思想錄",
        "orig": "L'homme n'est qu'un roseau, le plus faible de la nature ; mais c'est un roseau pensant.",
        "en": "Man is only a reed, the weakest in nature; but he is a thinking reed.",
        "authorEn": "Blaise Pascal",
        "workEn": "Pensées"
    },
    {
        "zh": "讀書使人充實，討論使人機敏，寫作使人精確。",
        "author": "培根",
        "work": "論讀書",
        "orig": "Reading maketh a full man; conference a ready man; and writing an exact man.",
        "en": "Reading maketh a full man; conference a ready man; and writing an exact man.",
        "authorEn": "Francis Bacon",
        "workEn": "Of Studies"
    },
    {
        "zh": "失去的時間再也找不回來。",
        "author": "富蘭克林",
        "work": "窮理查年鑑",
        "orig": "Lost time is never found again.",
        "en": "Lost time is never found again.",
        "authorEn": "Benjamin Franklin",
        "workEn": "Poor Richard's Almanack"
    }
];
