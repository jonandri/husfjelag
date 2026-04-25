// src/ui/helpContent.js

export const HELP = {
    husfelag: {
        title: 'Húsfélag',
        intro: 'Húsfélag er lögaðili sem annast rekstur fjöleignarhúss. Hér eru skráðar grunnupplýsingar um félagið.',
        items: [
            {
                heading: 'Hvað er húsfélag?',
                body: 'Húsfélag er samtök allra eigenda í fjölbýlishúsi. Það sér um sameiginlegan kostnað eins og hita, rafmagn, tryggingar og viðhald.',
            },
            {
                heading: 'Kennitala húsfélags',
                body: 'Kennitala er 10 stafa auðkenni sem gefin er út af Þjóðskrá. Hún þarf að vera rétt skráð þar sem hún er notuð á reikninga og í samskiptum við stofnanir.',
            },
            {
                heading: 'Stillingar',
                body: 'Á þessari síðu er hægt að uppfæra nafn, heimilisfang og netfang húsfélags. Breytingar taka strax gildi.',
            },
        ],
    },

    ibudir: {
        title: 'Íbúðir',
        intro: 'Hér eru skráðar allar íbúðir í húsfélaginu ásamt hlutfalli eignarhluta hverrar íbúðar.',
        items: [
            {
                heading: 'Eignarhlutfall',
                body: 'Eignarhlutfall ákvarðar hversu stóran hluta af sameiginlegum kostnaði íbúðareigandi greiðir. Til dæmis: ef íbúð á 10% hlut greiðir hún 10% af mánaðarlegum húsgjöldum.',
            },
            {
                heading: 'Bæta við íbúð',
                body: 'Smelltu á "Bæta við íbúð" til að skrá nýja íbúð. Þú þarft að gefa upp íbúðarnúmer og eignarhlutfall. Samtals eignarhlutfall allra íbúða þarf að vera 100%.',
            },
            {
                heading: 'Innflutningur',
                body: 'Þú getur sótt lista af íbúðum frá HMS (Húsnæðis-, mannvirkja- og skipulagsstofnun) og flutt hann inn í einu lagi með því að nota "Innflutningur" hnappinn.',
            },
        ],
    },

    eigendur: {
        title: 'Eigendur',
        intro: 'Hér eru skráðir eigendur hverrar íbúðar. Nákvæmlega einn eigandi á hverri íbúð verður að vera skráður sem greiðandi.',
        items: [
            {
                heading: 'Eigandi vs. greiðandi',
                body: 'Íbúð getur átt fleiri en einn eiganda en nákvæmlega einn þeirra er greiðandinn — sá sem fær innheimtukröfuna á hverjum mánuði og er skráður á bankayfirlit.',
            },
            {
                heading: 'Skipta um greiðanda',
                body: 'Til að skipta um greiðanda: smelltu á íbúðina, veldu þann eiganda sem á að taka við greiðslum og merktu hann sem greiðanda. Gamli greiðandinn heldur eignarhlut sínum.',
            },
            {
                heading: 'Skrá nýjan eiganda',
                body: 'Smelltu á "Bæta við eiganda" á viðkomandi íbúð. Þú þarft kennitölu einstaklingsins. Ef hann er þegar skráður í kerfið tengist hann sjálfkrafa.',
            },
        ],
    },

    aaetlun: {
        title: 'Áætlun',
        intro: 'Árleg fjárhagsáætlun húsfélags. Áætlunin skiptist í flokka og ákvarðar mánaðarlegar húsgjaldakröfur.',
        items: [
            {
                heading: 'Hvernig virkar áætlunin?',
                body: 'Þú býrð til eina áætlun á ári. Heildarupphæðin skiptist jafnt á 12 mánuði og síðan á hverja íbúð miðað við eignarhlutfall. Þannig fær til dæmis 10% íbúð 1/10 af mánaðarlegri heildarupphæð.',
            },
            {
                heading: 'Flokkar',
                body: 'Áætlunin er sundurliðuð í útgjaldaflokka eins og Hitaveita, Rafmagn, Húseigendatrygging og Framkvæmdasjóður. Þetta gerir kleift að bera saman áætlaðan og raunverulegan kostnað á hvern flokk í yfirlitinu.',
            },
            {
                heading: 'Búa til nýja áætlun',
                body: 'Smelltu á "Ný áætlun" og fylgdu leiðsagnarferlinu. Þú munt vera beðinn um að slá inn upphæð fyrir hvern útgjaldaflokk. Þegar áætlun er virkjuð eru innheimtukröfur búnar til sjálfkrafa.',
            },
        ],
    },

    'aaetlun-wizard': {
        title: 'Búa til áætlun — leiðsögn',
        intro: 'Leiðsagnarferlið hjálpar þér að búa til nýja árslega fjárhagsáætlun í nokkrum skrefum.',
        items: [
            {
                heading: 'Skref 1 — Grunnupplýsingar',
                body: 'Veldu árið sem áætlunin gildir fyrir og gefðu henni nafn ef þú vilt. Venjulega er nóg að nota árið (t.d. 2025).',
            },
            {
                heading: 'Skref 2 — Útgjaldaflokkar',
                body: 'Bættu við útgjaldaflokkum og tilgreindu áætlaða upphæð fyrir hvern flokk. Þú getur skoðað fyrri ár til að fá viðmið. Heildarupphæðin ráðstafar mánaðarlegum húsgjöldum.',
            },
            {
                heading: 'Skref 3 — Staðfesting',
                body: 'Yfirfarðu sundurliðunina áður en þú staðfestir. Þegar þú staðfestir er áætlunin virkjuð og hægt er að búa til innheimtukröfur.',
            },
        ],
    },

    innheimta: {
        title: 'Innheimta',
        intro: 'Innheimta sýnir mánaðarlegar húsgjaldakröfur sem búnar eru til úr árlegri áætlun. Hér sérðu hvað hvert heimilisfang skuldar og hvort greiðsla hafi borist.',
        items: [
            {
                heading: 'Staða greiðslu',
                body: 'Hver innheimtufærsla er í einni af þremur stöðum: PENDING (á bið — greiðsla ekki borist), PAID (greidd — greiðsla fundið), eða OVERDUE (í vanskilum).',
            },
            {
                heading: 'Sjálfvirk samræming',
                body: 'Þegar þú flytur inn bankafærslur reynir kerfið sjálfkrafa að para greiðslur við opnar innheimtukröfur, miðað við kennitölu greiðanda og upphæð.',
            },
            {
                heading: 'Handvirk tenging',
                body: 'Ef kerfið getur ekki fundið samræmi sjálfkrafa geturðu tengt greiðslu handvirkt. Smelltu á tengihnappinn (🔗) við hliðina á PENDING kröfu og veldu viðeigandi bankafærslu úr listanum.',
            },
            {
                heading: 'Búa til innheimtu',
                body: 'Ef engar innheimtufærslur eru til staðar fyrir valinn mánuð skaltu smella á "Búa til" hnappinn. Kerfið les þá áætlun ársins og reiknar út upphæð hverrar íbúðar.',
            },
        ],
    },

    'innheimta-tengja': {
        title: 'Tengja greiðslu handvirkt',
        intro: 'Þegar kerfið getur ekki fundið samræmi sjálfkrafa getur þú valið bankafærslu handvirkt til að para við þessa innheimtukröfu.',
        items: [
            {
                heading: 'Hvernig á að velja greiðslu',
                body: 'Listinn sýnir óparaðar bankafærslur frá þessum greiðanda. Smelltu á línuna sem á við og staðfestu svo með "Tengja" hnappinum. Staðan breytist þá í PAID.',
            },
            {
                heading: 'Ef rétt greiðsla er ekki á listanum',
                body: 'Kerfið sýnir einungis færslur sem eru ekki þegar tengdar við aðra innheimtukröfu. Ef greiðslan er ekki sjáanleg gæti hún verið tengd annarri kröfu — farðu á Færslur síðuna til að skoða.',
            },
        ],
    },

    faerslur: {
        title: 'Færslur',
        intro: 'Hér eru allar bankafærslur á bankareikningum húsfélags. Færslur eru flokkaðar í útgjaldaflokka og greiðslur frá eigendum eru paraðar við innheimtukröfur.',
        items: [
            {
                heading: 'Innflutningur',
                body: 'Settu bankayfirlitið í CSV eða Excel sniði inn með því að smella á "Innflutningur". Kerfið les færslurnar og reynir að flokka þær sjálfkrafa.',
            },
            {
                heading: 'Flokkun',
                body: 'Þú getur flokkað hverja færslu handvirkt með því að velja flokk úr fellivalmynd. Rétt flokkun skiptir máli því hún birtist í sundurliðun yfirlitsins.',
            },
            {
                heading: 'Sjálfvirk flokkunarreglur',
                body: 'Undir "Flokkunarreglur" geturðu sett upp reglur sem flokka færslur sjálfkrafa eftir lýsingu. Til dæmis: allar færslur sem innihalda "Hitaveita" fá flokkinn Hitaveita.',
            },
        ],
    },

    yfirlit: {
        title: 'Yfirlit',
        intro: 'Fjárhagsyfirlit húsfélags. Sýnir tekjur, gjöld, samanburð við áætlun og stöðu ógreiddra húsgjalda.',
        items: [
            {
                heading: 'KPI spjöldin',
                body: 'Efst á síðunni eru þrjár tölur: heildar tekjur, heildar gjöld og ógreidd húsgjöld (PENDING innheimtufærslur). Þær gefa skjótta mynd af stöðu félagsins.',
            },
            {
                heading: 'Áætlun vs. raunveruleg gjöld',
                body: 'Töfluna sýnir hvern útgjaldaflokk með áætlaðri og raunverulegri upphæð. Rauður litur þýðir að raunveruleg gjöld fara yfir áætlun, grænn þýðir undir áætlun.',
            },
            {
                heading: 'Mánaðarlegt yfirlit',
                body: 'Súluritin sýna mánaðarlegar tekjur og gjöld yfir árið. Þetta hjálpar til við að greina óvenjulegar sveiflur eða stóra einstaka greiðslu.',
            },
        ],
    },
};
